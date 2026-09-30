import { describe, expect, test } from 'bun:test';
import { Effect, Either } from 'effect';

import type { ProviderSession } from '@/types/session';
import { traktAuthedRequest } from './api';
import { tmdbRequest } from '@/lib/providers/tmdb/api';
import type { TokenStore } from '@/lib/providers/token-store';
import type { TraktDeps } from './deps';

const STALE: ProviderSession = {
  accessToken: 'stale',
  refreshToken: 'r1',
  expiresAt: 0,
};

function fakeTokenStore(initial: ProviderSession | null): TokenStore {
  let current = initial;
  return {
    get: () => current,
    set: (session) => {
      current = session;
    },
    clear: () => {
      current = null;
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/**
 * Deps where `/data` 401s on the stale token and succeeds on the refreshed
 * one, and the token grant is slow enough that concurrent 401s overlap it.
 * `refreshStatus` != 200 makes the grant itself fail.
 */
function raceDeps(options: { refreshStatus?: number } = {}) {
  const tokens = fakeTokenStore(STALE);
  let refreshCalls = 0;

  const deps: TraktDeps = {
    tokens,
    clientId: 'id',
    clientSecret: 'secret',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/oauth/token') {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (options.refreshStatus != null && options.refreshStatus !== 200) {
          return json({ error: 'invalid_grant' }, options.refreshStatus);
        }
        return json({
          access_token: `fresh-${refreshCalls}`,
          refresh_token: `r${refreshCalls + 1}`,
          expires_in: 3600,
          created_at: Math.floor(Date.now() / 1000),
        });
      }
      if (path === '/data') {
        return authHeader(init)?.startsWith('Bearer fresh-')
          ? json({ ok: true })
          : json(null, 401);
      }
      throw new Error(`unexpected path ${path}`);
    },
  };

  return { deps, tokens, refreshCalls: () => refreshCalls };
}

function run(deps: TraktDeps, signal?: AbortSignal) {
  return Effect.runPromise(
    Effect.either(traktAuthedRequest<{ ok: boolean }>(deps, '/data')),
    { signal },
  );
}

test.each(['trakt', 'tmdb'] as const)('%s does not retry before a long Retry-After expires', async (provider) => {
  let calls = 0;
  const { deps } = raceDeps();
  deps.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
  };
  const error = await Effect.runPromise(Effect.flip(
    provider === 'trakt'
      ? traktAuthedRequest(deps, '/data')
      : tmdbRequest({ fetch: deps.fetch, token: 'test' }, '/data'),
  ));
  expect(calls).toBe(1);
  expect(error._tag).toBe('ProviderRateLimitError');
  if (error._tag === 'ProviderRateLimitError') expect(error.retryAfterMs).toBe(60_000);
}, 10_000);

describe('traktAuthedRequest refresh coalescing', () => {
  test('cancelling one waiter does not cancel the shared token grant', async () => {
    const { deps, tokens, refreshCalls } = raceDeps();
    const fetch = deps.fetch;
    let grantStarted!: () => void;
    const started = new Promise<void>((resolve) => { grantStarted = resolve; });
    deps.fetch = (input, init) => {
      if (String(input).includes('/oauth/token')) grantStarted();
      return fetch(input, init);
    };
    const controller = new AbortController();
    const cancelled = run(deps, controller.signal).catch(() => null);
    const surviving = run(deps);
    await started;
    controller.abort();
    expect(await cancelled).toBeNull();
    expect(Either.isRight(await surviving)).toBe(true);
    expect(refreshCalls()).toBe(1);
    expect(tokens.get()?.accessToken).toBe('fresh-1');
  });

  test('concurrent 401s share one token grant and all succeed', async () => {
    const { deps, tokens, refreshCalls } = raceDeps();

    const results = await Promise.all([run(deps), run(deps), run(deps)]);

    expect(refreshCalls()).toBe(1);
    for (const result of results) {
      expect(Either.isRight(result)).toBe(true);
    }
    // The rotated session survives — no loser wiped it.
    expect(tokens.get()?.accessToken).toBe('fresh-1');
  });

  test('a later expiry triggers a new refresh (coalescing window closes)', async () => {
    const { deps, tokens, refreshCalls } = raceDeps();

    await run(deps);
    expect(refreshCalls()).toBe(1);

    tokens.set(STALE); // token expired again
    const result = await run(deps);

    expect(refreshCalls()).toBe(2);
    expect(Either.isRight(result)).toBe(true);
  });

  test('a definitively rejected refresh fails every waiter and clears once', async () => {
    const { deps, tokens, refreshCalls } = raceDeps({ refreshStatus: 401 });

    const results = await Promise.all([run(deps), run(deps)]);

    expect(refreshCalls()).toBe(1);
    for (const result of results) {
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe('ProviderAuthError');
        expect(
          result.left._tag === 'ProviderAuthError' && result.left.refreshFailed,
        ).toBe(true);
      }
    }
    expect(tokens.get()).toBeNull();
  });
});
