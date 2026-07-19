import { Duration, Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { TMDB_API_BASE_URL } from './config';
import type { TmdbDeps } from './deps';

// Reads fired from a tap on a person card must not hang for a long
// Retry-After — sleep at most this long, retry once, then surface the error.
const RATE_LIMIT_MAX_SLEEP_MS = 5_000;

/**
 * One public TMDB GET mapped into the ProviderError taxonomy, with one
 * rate-limit retry honoring Retry-After (trakt/api.ts pattern). All TMDB
 * calls are reads with the v4 Bearer token — there is no authed/refresh
 * variant: a 401 means the embedded token is bad, which no retry fixes,
 * so it surfaces with `refreshFailed: true`.
 */
export function tmdbRequest<A>(
  deps: TmdbDeps,
  path: string,
): Effect.Effect<A, ProviderError> {
  const attempt = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(`${TMDB_API_BASE_URL}${path}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deps.token}`,
          },
        }),
      catch: (cause) => new ProviderNetworkError({ provider: 'tmdb', cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider: 'tmdb', refreshFailed: true });
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      return yield* new ProviderRateLimitError({
        provider: 'tmdb',
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? { retryAfterMs: retryAfterSeconds * 1000 }
          : {}),
      });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider: 'tmdb',
        cause: new Error(`TMDB responded ${response.status} for ${path}`),
      });
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: () =>
        new ProviderDecodeError({
          provider: 'tmdb',
          detail: `non-JSON body from ${path}`,
        }),
    });
  });

  return attempt.pipe(
    Effect.catchTag('ProviderRateLimitError', (error) =>
      Effect.sleep(
        Duration.millis(Math.min(error.retryAfterMs ?? 1_000, RATE_LIMIT_MAX_SLEEP_MS)),
      ).pipe(Effect.zipRight(attempt)), // second 429 propagates as-is
    ),
  );
}
