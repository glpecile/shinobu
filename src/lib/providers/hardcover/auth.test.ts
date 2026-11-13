import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { TokenStore } from '@/lib/providers/token-store';
import type { ProviderSession } from '@/types/session';

const flowStore = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => flowStore.get(key),
    set: (key: string, value: string) => flowStore.set(key, value),
    remove: (key: string) => flowStore.delete(key),
  }),
}));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'challenge',
}));

const { coalescedRefreshSession, exchangeHardcoverCode } = await import('./auth');
const { beginHardcoverAuthFlow } = await import('./authorize');
const { getHardcoverAuthFlow } = await import('./auth-flow');
const { HARDCOVER_GRAPHQL_URL, HARDCOVER_ISSUER, HARDCOVER_TOKEN_URL } = await import('./config');
const { hardcoverRequest } = await import('./http');
type HardcoverDeps = import('./deps').HardcoverDeps;

const REDIRECT = 'shinobu://redirect';
const STORED: ProviderSession = { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 1 };

/** A session slot two stores can share, as two tabs share `localStorage`. */
function makeStore(slot: { session: ProviderSession | null }): TokenStore {
  return {
    get: () => slot.session,
    set: (session) => {
      slot.session = session;
    },
    clear: () => {
      slot.session = null;
    },
  };
}

interface Call {
  url: string;
  body: URLSearchParams;
  authorization: string | null;
}

function makeDeps(
  respond: (call: Call) => Response | Promise<Response>,
  slot: { session: ProviderSession | null } = { session: { ...STORED } },
  refreshLock: HardcoverDeps['refreshLock'] = (run) => run(),
) {
  const calls: Call[] = [];
  const deps: HardcoverDeps = {
    clientId: 'cid',
    tokens: makeStore(slot),
    refreshLock,
    fetch: async (input, init) => {
      const call: Call = {
        url: String(input),
        body: new URLSearchParams(String(init?.body ?? '')),
        authorization: new Headers(init?.headers).get('Authorization'),
      };
      calls.push(call);
      return respond(call);
    },
  };
  const tokenCalls = () => calls.filter((call) => call.url === HARDCOVER_TOKEN_URL);
  return { deps, calls, slot, tokenCalls };
}

const rotated = (n: number) =>
  Response.json({ access_token: `at-${n}`, refresh_token: `rt-${n}`, expires_in: 604800 });

/** `at-1` has expired. Each grant rotates, on a slow token endpoint, and GraphQL takes only the newest token. */
function rotatingServer() {
  let generation = 1;
  return async (call: Call): Promise<Response> => {
    if (call.url === HARDCOVER_TOKEN_URL) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      generation += 1;
      return rotated(generation);
    }
    return generation > 1 && call.authorization === `Bearer at-${generation}`
      ? Response.json({ data: { ok: true } })
      : Response.json({ error: 'invalid_token' }, { status: 401 });
  };
}

beforeEach(() => flowStore.clear());

describe('exchangeHardcoverCode', () => {
  test('exchanges the code with the PKCE verifier and stores both tokens', async () => {
    const { deps, calls, slot } = makeDeps(() => rotated(2), { session: null });
    const url = new URL(await beginHardcoverAuthFlow({ clientId: 'cid', redirectUri: REDIRECT }));
    const flow = getHardcoverAuthFlow();

    await Effect.runPromise(
      exchangeHardcoverCode(deps, {
        code: 'code-1',
        state: url.searchParams.get('state') ?? '',
        iss: HARDCOVER_ISSUER,
        redirectUri: REDIRECT,
      }),
    );

    expect(url.searchParams.get('scope')).toBe(
      'read:me:content read:library write:library read:catalog:search read:journal',
    );
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: REDIRECT,
      client_id: 'cid',
      code_verifier: flow?.verifier ?? '',
    });
    expect(slot.session).toMatchObject({ accessToken: 'at-2', refreshToken: 'rt-2' });
    expect(getHardcoverAuthFlow()).toBeNull();
  });

  test('a redirect from another issuer never sends the code', async () => {
    const { deps, calls } = makeDeps(() => rotated(2), { session: null });
    const url = new URL(await beginHardcoverAuthFlow({ clientId: 'cid', redirectUri: REDIRECT }));

    const result = await Effect.runPromise(
      Effect.result(
        exchangeHardcoverCode(deps, {
          code: 'code-1',
          state: url.searchParams.get('state') ?? '',
          iss: null,
          redirectUri: REDIRECT,
        }),
      ),
    );

    expect(result._tag).toBe('Failure');
    expect(calls).toHaveLength(0);
  });
});

describe('token refresh', () => {
  test('two concurrent 401s refresh once and both run again with the new token', async () => {
    const { deps, tokenCalls, slot } = makeDeps(rotatingServer());

    const results = await Promise.all([
      Effect.runPromise(hardcoverRequest(deps, 'query A { a }')),
      Effect.runPromise(hardcoverRequest(deps, 'query B { b }')),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(tokenCalls()).toHaveLength(1);
    expect(tokenCalls()[0]?.body.get('refresh_token')).toBe('rt-1');
    expect(slot.session).toMatchObject({ accessToken: 'at-2', refreshToken: 'rt-2' });
  });

  test('two tabs sharing storage and the lock spend one refresh token', async () => {
    const slot = { session: { ...STORED } as ProviderSession | null };
    let held: Promise<unknown> = Promise.resolve();
    const lock: HardcoverDeps['refreshLock'] = (run) => {
      const next = held.then(run);
      held = next.catch(() => {});
      return next;
    };
    const server = rotatingServer();
    const tabA = makeDeps(server, slot, lock);
    const tabB = makeDeps(server, slot, lock);

    const sessions = await Promise.all([
      Effect.runPromise(coalescedRefreshSession(tabA.deps, 'at-1')),
      Effect.runPromise(coalescedRefreshSession(tabB.deps, 'at-1')),
    ]);

    expect(tabA.tokenCalls().length + tabB.tokenCalls().length).toBe(1);
    expect(sessions.map((session) => session.accessToken)).toEqual(['at-2', 'at-2']);
  });

  test('a refused refresh token keeps the session, marks it and stops calling Hardcover', async () => {
    const { deps, calls, slot } = makeDeps((call) =>
      call.url === HARDCOVER_GRAPHQL_URL
        ? Response.json({ error: 'invalid_token' }, { status: 401 })
        : Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );

    const first = await Effect.runPromise(Effect.result(hardcoverRequest(deps, 'query A { a }')));
    const callsAfterFirst = calls.length;
    const second = await Effect.runPromise(Effect.result(hardcoverRequest(deps, 'query A { a }')));

    for (const result of [first, second]) {
      expect(result).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'ProviderAuthError', refreshFailed: true },
      });
    }
    expect(slot.session).toEqual({ ...STORED, reconnectNeeded: true });
    expect(calls).toHaveLength(callsAfterFirst);
  });

  test('a refresh with no answer is never sent again and marks the session', async () => {
    const { deps, tokenCalls, slot } = makeDeps((call) => {
      if (call.url === HARDCOVER_TOKEN_URL) throw new TypeError('Network request failed');
      return Response.json({ error: 'invalid_token' }, { status: 401 });
    });

    const first = await Effect.runPromise(Effect.result(hardcoverRequest(deps, 'query A { a }')));
    const second = await Effect.runPromise(Effect.result(hardcoverRequest(deps, 'query A { a }')));

    expect(first).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ProviderNetworkError', retryable: false },
    });
    expect(second).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ProviderAuthError', refreshFailed: true },
    });
    expect(tokenCalls()).toHaveLength(1);
    expect(slot.session).toEqual({ ...STORED, reconnectNeeded: true });
  });

  test('a 429 with no readable Retry-After holds later refreshes off the network', async () => {
    const { deps, tokenCalls, slot } = makeDeps(() => new Response('', { status: 429 }));

    const first = await Effect.runPromise(Effect.result(coalescedRefreshSession(deps, 'at-1')));
    const second = await Effect.runPromise(Effect.result(coalescedRefreshSession(deps, 'at-1')));

    expect(first).toMatchObject({ _tag: 'Failure', failure: { retryAfterMs: 60_000 } });
    expect(second).toMatchObject({ _tag: 'Failure', failure: { _tag: 'ProviderRateLimitError' } });
    expect(tokenCalls()).toHaveLength(1);
    expect(slot.session).toEqual(STORED);
  });
});
