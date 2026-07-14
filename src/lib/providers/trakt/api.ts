import { Duration, Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import { coalescedRefreshSession } from './auth';
import type { TraktDeps } from './deps';
import { traktHttp, type TraktHttpOptions } from './http';

// Writes fired from a tap on a media card must not hang for a long
// Retry-After — sleep at most this long, retry once, then surface the error.
const RATE_LIMIT_MAX_SLEEP_MS = 5_000;

function withRateLimitRetry<A>(
  effect: Effect.Effect<A, ProviderError>,
): Effect.Effect<A, ProviderError> {
  return effect.pipe(
    Effect.catchTag('ProviderRateLimitError', (error) =>
      Effect.sleep(
        Duration.millis(Math.min(error.retryAfterMs ?? 1_000, RATE_LIMIT_MAX_SLEEP_MS)),
      ).pipe(Effect.zipRight(effect)), // second 429 propagates as-is
    ),
  );
}

/**
 * A public (unauthenticated) Trakt call: client-id headers + one rate-limit
 * retry honoring Retry-After.
 */
export function traktRequest<A>(
  deps: TraktDeps,
  path: string,
  options: Omit<TraktHttpOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  return withRateLimitRetry(traktHttp<A>(deps, path, options));
}

/**
 * An authenticated Trakt call implementing the AGENTS.md query convention:
 * a 401 triggers the refresh flow once (coalesced — concurrent 401s share a
 * single token grant, since Trakt rotates refresh tokens and parallel
 * refreshes would race), then the request retries with the new token; if the
 * refresh itself is rejected the session is dead and the error carries
 * `refreshFailed: true`.
 */
export function traktAuthedRequest<A>(
  deps: TraktDeps,
  path: string,
  options: Omit<TraktHttpOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  // Suspended so the token is read when the effect *runs*, not when it is
  // composed — the post-refresh retry below is built before the refresh
  // executes and must pick up the rotated token, not the stale one.
  const attempt = () =>
    Effect.suspend(() =>
      traktHttp<A>(deps, path, {
        ...options,
        accessToken: deps.tokens.get()?.accessToken,
      }),
    );

  return withRateLimitRetry(
    attempt().pipe(
      Effect.catchTag('ProviderAuthError', (error) =>
        error.refreshFailed
          ? Effect.fail(error)
          : coalescedRefreshSession(deps).pipe(Effect.zipRight(attempt())),
      ),
    ),
  );
}
