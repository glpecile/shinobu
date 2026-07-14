import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { TRAKT_API_BASE_URL } from './config';
import type { TraktDeps } from './deps';

export interface TraktHttpOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string;
}

/**
 * Lowest layer: one Trakt HTTP round-trip mapped into the ProviderError
 * taxonomy. No refresh/retry policy here — that composes on top (api.ts),
 * and auth.ts uses this directly for the token grants themselves.
 */
export function traktHttp<A>(
  deps: TraktDeps,
  path: string,
  options: TraktHttpOptions = {},
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(`${TRAKT_API_BASE_URL}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': deps.clientId,
            ...(options.accessToken
              ? { Authorization: `Bearer ${options.accessToken}` }
              : {}),
          },
          ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
        }),
      catch: (cause) => new ProviderNetworkError({ provider: 'trakt', cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider: 'trakt', refreshFailed: false });
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      return yield* new ProviderRateLimitError({
        provider: 'trakt',
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? { retryAfterMs: retryAfterSeconds * 1000 }
          : {}),
      });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: 'trakt',
        cause: new Error(`Trakt responded ${response.status} for ${path}`),
      });
    }
    // No endpoint we call returns 204 (reads are 200, /sync/history is 201,
    // token grants are 200). Returning `undefined as A` here would silently
    // hand a caller expecting JSON a lie — fail loudly instead; if a genuine
    // no-content endpoint is ever added, give it an explicit void-typed path.
    if (response.status === 204) {
      return yield* new ProviderDecodeError({
        provider: 'trakt',
        detail: `unexpected empty 204 response from ${path}`,
      });
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: () =>
        new ProviderDecodeError({
          provider: 'trakt',
          detail: `non-JSON body from ${path}`,
        }),
    });
  });
}
