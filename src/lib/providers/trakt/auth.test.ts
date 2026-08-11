import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import type { TokenStore } from '@/lib/providers/token-store';
import type { TraktDeps } from './deps';
import { refreshSession } from './auth';

/**
 * Refresh-grant behavior after Trakt detachment (plan 0034 U9 / KTD-7).
 *
 * With no resolvable client credentials the grant cannot possibly succeed —
 * but it must fail *fast* (no network round-trip) and *without clearing the
 * stored session*: the token is the evidence that drives the MigrationNeeded
 * banner (R13); wiping it would be the silent logout the plan forbids.
 */

interface FakeStore extends TokenStore {
  session: ProviderSession | null;
  clearCalls: number;
}

function makeStore(initial: ProviderSession | null): FakeStore {
  const store: FakeStore = {
    session: initial,
    clearCalls: 0,
    get: () => store.session,
    set: (session) => {
      store.session = session;
    },
    clear: () => {
      store.clearCalls += 1;
      store.session = null;
    },
  };
  return store;
}

const STORED_SESSION: ProviderSession = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: 1_000,
};

function makeDeps(overrides: {
  clientId: string;
  clientSecret: string;
  store?: FakeStore;
  respond?: () => Response;
}): { deps: TraktDeps; store: FakeStore; fetchCalls: number[] } {
  const store = overrides.store ?? makeStore({ ...STORED_SESSION });
  const fetchCalls: number[] = [];
  const deps: TraktDeps = {
    fetch: async () => {
      fetchCalls.push(1);
      return overrides.respond?.() ?? new Response('{}', { status: 401 });
    },
    tokens: store,
    clientId: overrides.clientId,
    clientSecret: overrides.clientSecret,
  };
  return { deps, store, fetchCalls };
}

async function run(deps: TraktDeps) {
  return Effect.runPromise(Effect.either(refreshSession(deps)));
}

describe('refreshSession credential short-circuit (plan 0034 U9)', () => {
  test('empty clientId fails fast: ProviderAuthError, no network call, session kept', async () => {
    const { deps, store, fetchCalls } = makeDeps({
      clientId: '',
      clientSecret: 'secret',
    });

    const outcome = await run(deps);

    expect(outcome._tag).toBe('Left');
    if (outcome._tag === 'Left') {
      expect(outcome.left._tag).toBe('ProviderAuthError');
    }
    expect(fetchCalls).toHaveLength(0);
    // The stored token is migration evidence (R13) — it must survive.
    expect(store.clearCalls).toBe(0);
    expect(store.session).toEqual(STORED_SESSION);
  });

  test('empty clientSecret fails fast the same way', async () => {
    const { deps, store, fetchCalls } = makeDeps({
      clientId: 'cid',
      clientSecret: '',
    });

    const outcome = await run(deps);

    expect(outcome._tag).toBe('Left');
    expect(fetchCalls).toHaveLength(0);
    expect(store.session).toEqual(STORED_SESSION);
  });
});

describe('refreshSession with credentials (regression pins)', () => {
  test('a definitive rejection still clears the session (dead refresh token)', async () => {
    const { deps, store, fetchCalls } = makeDeps({
      clientId: 'cid',
      clientSecret: 'secret',
    });

    const outcome = await run(deps);

    expect(outcome._tag).toBe('Left');
    expect(fetchCalls).toHaveLength(1);
    expect(store.session).toBeNull();
  });

  test('a successful grant stores the refreshed session', async () => {
    const { deps, store } = makeDeps({
      clientId: 'cid',
      clientSecret: 'secret',
      respond: () =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 100,
            created_at: 10,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const outcome = await run(deps);

    expect(outcome._tag).toBe('Right');
    expect(store.session?.accessToken).toBe('new-access');
  });
});
