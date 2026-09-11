import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { TokenStore } from '@/lib/providers/token-store';
import type { AniListDeps } from './deps';
import { ANILIST_REFERER, anilistAuthedRequest, anilistGraphQL } from './http';

function fakeTokens(overrides: Partial<TokenStore> = {}): TokenStore {
  return {
    get: () => ({ accessToken: 'tok' }),
    set: () => {},
    clear: () => {},
    ...overrides,
  };
}

function depsReplying(response: () => Response, tokens = fakeTokens()): AniListDeps {
  return { tokens, fetch: async () => response() };
}

describe('anilistGraphQL error mapping', () => {
  test('HTTP 401 maps to ProviderAuthError with refreshFailed (no refresh grant exists)', async () => {
    const result = await Effect.runPromise(
      Effect.either(
        anilistGraphQL(depsReplying(() => new Response('', { status: 401 })), 'query { Viewer { id } }'),
      ),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ProviderAuthError');
      expect(result.left._tag === 'ProviderAuthError' && result.left.refreshFailed).toBe(true);
    }
  });

  test('a 400 body with "Invalid token" GraphQL error is also an auth error', async () => {
    const body = { errors: [{ message: 'Invalid token', status: 400 }] };
    const result = await Effect.runPromise(
      Effect.either(
        anilistGraphQL(
          depsReplying(() => Response.json(body, { status: 400 })),
          'query { Viewer { id } }',
        ),
      ),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ProviderAuthError');
    }
  });

  test('429 carries Retry-After as retryAfterMs', async () => {
    const result = await Effect.runPromise(
      Effect.either(
        anilistGraphQL(
          depsReplying(
            () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
          ),
          'query { Viewer { id } }',
        ),
      ),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ProviderRateLimitError');
      expect(
        result.left._tag === 'ProviderRateLimitError' && result.left.retryAfterMs,
      ).toBe(30_000);
    }
  });

  test('every request carries the app Referer (AniList 403s referer-less clients)', async () => {
    let sent: RequestInit | undefined;
    const deps: AniListDeps = {
      tokens: fakeTokens(),
      fetch: async (_url, init) => {
        sent = init;
        return Response.json({ data: { Media: { id: 1 } } });
      },
    };
    await Effect.runPromise(anilistGraphQL(deps, '{ Media(id: 1) { id } }'));
    expect(new Headers(sent?.headers).get('Referer')).toBe(ANILIST_REFERER);
  });

  test('a 403 with the "temporarily disabled" body is a refusal with its status, not a rate limit', async () => {
    const body = {
      errors: [
        {
          message: 'The AniList API has been temporarily disabled due to severe stability issues.',
          status: 403,
        },
      ],
      data: null,
    };
    const result = await Effect.runPromise(
      Effect.either(
        anilistGraphQL(
          depsReplying(() => Response.json(body, { status: 403 })),
          '{ Media(id: 1) { id } }',
        ),
      ),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ProviderNetworkError');
      if (result.left._tag === 'ProviderNetworkError') {
        expect(result.left.status).toBe(403);
        expect(result.left.message).toContain('refused the request (HTTP 403)');
      }
    }
  });

  test('GraphQL errors on a 200 fail instead of returning partial data', async () => {
    const body = { data: null, errors: [{ message: 'Not Found.', status: 404 }] };
    const result = await Effect.runPromise(
      Effect.either(
        anilistGraphQL(depsReplying(() => Response.json(body)), 'query { X }'),
      ),
    );
    expect(result._tag).toBe('Left');
  });
});

describe('anilistAuthedRequest', () => {
  test('an auth failure clears the stored session (reconnect is the only recovery)', async () => {
    let cleared = false;
    const tokens = fakeTokens({ clear: () => { cleared = true; } });
    const result = await Effect.runPromise(
      Effect.either(
        anilistAuthedRequest(
          depsReplying(() => new Response('', { status: 401 }), tokens),
          'query { Viewer { id } }',
        ),
      ),
    );
    expect(result._tag).toBe('Left');
    expect(cleared).toBe(true);
  });

  test('no stored session fails without a network call', async () => {
    let fetched = false;
    const deps: AniListDeps = {
      tokens: fakeTokens({ get: () => null }),
      fetch: async () => {
        fetched = true;
        return Response.json({ data: {} });
      },
    };
    const result = await Effect.runPromise(
      Effect.either(anilistAuthedRequest(deps, 'query { Viewer { id } }')),
    );
    expect(result._tag).toBe('Left');
    expect(fetched).toBe(false);
  });

  test('a rate-limited call retries once after the advertised delay', async () => {
    let calls = 0;
    const deps = depsReplying(() => {
      calls += 1;
      return calls === 1
        ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
        : Response.json({ data: { ok: true } });
    });
    const result = await Effect.runPromise(
      anilistAuthedRequest<{ ok: boolean }>(deps, 'query { X }'),
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
