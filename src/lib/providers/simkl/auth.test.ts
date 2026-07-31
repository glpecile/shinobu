import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';

// react-native-mmkv is a native module that can't load under bun — back the
// per-flow verifier/state storage with an in-memory Map (the same pattern as
// state/session/serializd.test.ts).
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));

// expo-crypto needs the native runtime too — mirror the exact surface auth.ts
// consumes with bun's WebCrypto so the S256 derivation is real SHA-256.
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async (_algorithm: string, data: string) => {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(data),
    );
    return Buffer.from(digest).toString('base64');
  },
}));

const {
  beginSimklAuthFlow,
  buildSimklAuthorizeUrl,
  clearSimklAuthFlow,
  createSimklPkcePair,
  deriveSimklCodeChallenge,
  exchangeSimklCode,
  getSimklAuthFlow,
  saveSimklAuthFlow,
} = await import('./auth');
type SimklDeps = import('./deps').SimklDeps;

interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

function makeDeps(handler: (url: string, init?: RequestInit) => Response): {
  deps: SimklDeps;
  calls: RecordedCall[];
  sessions: ProviderSession[];
} {
  const calls: RecordedCall[] = [];
  const sessions: ProviderSession[] = [];
  const deps: SimklDeps = {
    clientId: 'cid-1',
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return handler(String(input), init);
    },
    tokens: {
      get: () => null,
      set: (session) => {
        sessions.push(session);
      },
      clear: () => {},
    },
  };
  return { deps, calls, sessions };
}

beforeEach(() => store.clear());

describe('createSimklPkcePair / deriveSimklCodeChallenge', () => {
  test('matches the RFC 7636 appendix B test vector', async () => {
    const challenge = await deriveSimklCodeChallenge(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    );
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('generates an unreserved verifier in the 43-128 length window', async () => {
    const { verifier } = await createSimklPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  test('challenge is the base64url S256 of the verifier — no padding, url-safe', async () => {
    const { verifier, challenge } = await createSimklPkcePair();
    expect(challenge).toBe(await deriveSimklCodeChallenge(verifier));
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });
});

describe('buildSimklAuthorizeUrl', () => {
  test('carries challenge + S256 + state + the registered redirect', () => {
    const url = new URL(
      buildSimklAuthorizeUrl({
        clientId: 'cid-1',
        redirectUri: 'shinobu://redirect',
        codeChallenge: 'chal-1',
        state: 'state-1',
      }),
    );
    expect(url.origin).toBe('https://simkl.com');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid-1');
    expect(url.searchParams.get('redirect_uri')).toBe('shinobu://redirect');
    expect(url.searchParams.get('code_challenge')).toBe('chal-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-1');
    // The quickstart's authorize example carries the standard params too.
    expect(url.searchParams.get('app-name')).toBe('shinobu');
    expect(url.searchParams.get('app-version')).not.toBeNull();
  });
});

describe('beginSimklAuthFlow', () => {
  test('persists the verifier + state it embeds in the authorize URL', async () => {
    const url = new URL(
      await beginSimklAuthFlow({ clientId: 'cid-1', redirectUri: 'shinobu://redirect' }),
    );
    const flow = getSimklAuthFlow();
    expect(flow).not.toBeNull();
    expect(url.searchParams.get('state')).toBe(flow!.state);
    expect(url.searchParams.get('code_challenge')).toBe(
      await deriveSimklCodeChallenge(flow!.verifier),
    );
  });
});

describe('exchangeSimklCode', () => {
  const token = {
    access_token: 'tok-1',
    token_type: 'bearer',
    scope: 'public',
    expires_in: 157680000,
  };

  test('POSTs code_verifier and never any secret field', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps, calls, sessions } = makeDeps(() => Response.json(token));

    const session = await Effect.runPromise(
      exchangeSimklCode(deps, {
        code: 'code-1',
        state: 'state-1',
        redirectUri: 'shinobu://redirect',
      }),
    );

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.pathname).toBe('/oauth/token');
    // Standard params travel on the token exchange too (Simkl quickstart).
    expect(url.searchParams.get('client_id')).toBe('cid-1');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      code_verifier: 'ver-1',
      client_id: 'cid-1',
      redirect_uri: 'shinobu://redirect',
    });
    expect(Object.keys(body)).not.toContain('client_secret');
    expect(session.accessToken).toBe('tok-1');
    expect(sessions).toEqual([session]);
  });

  test('a mismatched state never POSTs', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps, calls, sessions } = makeDeps(() => Response.json(token));

    const error = await Effect.runPromise(
      Effect.flip(
        exchangeSimklCode(deps, {
          code: 'code-1',
          state: 'state-evil',
          redirectUri: 'shinobu://redirect',
        }),
      ),
    );

    expect(error._tag).toBe('ProviderAuthError');
    expect(calls).toHaveLength(0);
    expect(sessions).toHaveLength(0);
  });

  test('a missing stored flow never POSTs', async () => {
    const { deps, calls } = makeDeps(() => Response.json(token));
    const error = await Effect.runPromise(
      Effect.flip(
        exchangeSimklCode(deps, {
          code: 'code-1',
          state: 'state-1',
          redirectUri: 'shinobu://redirect',
        }),
      ),
    );
    expect(error._tag).toBe('ProviderAuthError');
    expect(calls).toHaveLength(0);
  });

  test('clears the stored verifier + state after a successful exchange', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps } = makeDeps(() => Response.json(token));
    await Effect.runPromise(
      exchangeSimklCode(deps, {
        code: 'code-1',
        state: 'state-1',
        redirectUri: 'shinobu://redirect',
      }),
    );
    expect(getSimklAuthFlow()).toBeNull();
  });

  test('clears the stored verifier + state after a failed exchange too', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps, sessions } = makeDeps(() => new Response(null, { status: 503 }));
    const error = await Effect.runPromise(
      Effect.flip(
        exchangeSimklCode(deps, {
          code: 'code-1',
          state: 'state-1',
          redirectUri: 'shinobu://redirect',
        }),
      ),
    );
    expect(error._tag).toBe('ProviderNetworkError');
    expect(getSimklAuthFlow()).toBeNull();
    expect(sessions).toHaveLength(0);
  });

  test('a 401 from the token endpoint maps to ProviderAuthError with no retry', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps, calls } = makeDeps(() => new Response(null, { status: 401 }));
    const error = await Effect.runPromise(
      Effect.flip(
        exchangeSimklCode(deps, {
          code: 'code-1',
          state: 'state-1',
          redirectUri: 'shinobu://redirect',
        }),
      ),
    );
    expect(error._tag).toBe('ProviderAuthError');
    expect(calls).toHaveLength(1);
  });

  test('a 400 rate_limit body from the token endpoint maps to ProviderRateLimitError', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps } = makeDeps(
      () => Response.json({ error: 'rate_limit' }, { status: 400 }),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        exchangeSimklCode(deps, {
          code: 'code-1',
          state: 'state-1',
          redirectUri: 'shinobu://redirect',
        }),
      ),
    );
    expect(error._tag).toBe('ProviderRateLimitError');
  });

  test('a token payload without expires_in yields a session without expiresAt', async () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    const { deps, sessions } = makeDeps(
      () => Response.json({ access_token: 'tok-2', token_type: 'bearer' }),
    );
    await Effect.runPromise(
      exchangeSimklCode(deps, {
        code: 'code-1',
        state: 'state-1',
        redirectUri: 'shinobu://redirect',
      }),
    );
    expect(sessions[0]).toEqual({ accessToken: 'tok-2' });
  });
});

describe('clearSimklAuthFlow', () => {
  test('deletes the stored flow', () => {
    saveSimklAuthFlow({ verifier: 'ver-1', state: 'state-1' });
    expect(getSimklAuthFlow()).not.toBeNull();
    clearSimklAuthFlow();
    expect(getSimklAuthFlow()).toBeNull();
  });
});
