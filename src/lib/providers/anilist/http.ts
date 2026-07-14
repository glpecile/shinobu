import { Duration, Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { AniListDeps } from './deps';

// Lives here (not config.ts) so the Effect layer stays free of react-native
// imports — config.ts branches on Platform, which bun:test cannot load.
export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

export interface AniListGraphQLOptions {
  variables?: Record<string, unknown>;
  accessToken?: string;
}

interface GraphQLResponseBody<A> {
  data?: A | null;
  errors?: Array<{ message?: string; status?: number }>;
}

/**
 * Lowest layer: one GraphQL round-trip mapped into the ProviderError
 * taxonomy. AniList reports failures both ways — as non-2xx statuses *and*
 * as a 200 whose body carries `errors[]` — so both paths are handled here.
 * No refresh policy exists at all: the implicit grant has no refresh token
 * (docs/solutions/web-cors-anilist.md), which is why there is no AniList
 * counterpart to trakt's auth.ts.
 */
export function anilistGraphQL<A>(
  deps: AniListDeps,
  query: string,
  options: AniListGraphQLOptions = {},
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(ANILIST_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.accessToken
              ? { Authorization: `Bearer ${options.accessToken}` }
              : {}),
          },
          body: JSON.stringify({
            query,
            variables: options.variables ?? {},
          }),
        }),
      catch: (cause) => new ProviderNetworkError({ provider: 'anilist', cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider: 'anilist', refreshFailed: true });
    }
    if (response.status === 429) {
      // Real budget is 30 req/min (docs/solutions/web-cors-anilist.md).
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      return yield* new ProviderRateLimitError({
        provider: 'anilist',
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? { retryAfterMs: retryAfterSeconds * 1000 }
          : {}),
      });
    }

    const body = yield* Effect.tryPromise({
      try: () => response.json() as Promise<GraphQLResponseBody<A>>,
      catch: () =>
        new ProviderDecodeError({
          provider: 'anilist',
          detail: `non-JSON GraphQL response (HTTP ${response.status})`,
        }),
    });

    if (body.errors != null && body.errors.length > 0) {
      const messages = body.errors.map((e) => e.message ?? 'unknown').join('; ');
      // AniList reports a dead/invalid bearer token as a GraphQL error
      // ("Invalid token"), not always as a bare 401.
      if (body.errors.some((e) => e.status === 401 || /invalid token/i.test(e.message ?? ''))) {
        return yield* new ProviderAuthError({ provider: 'anilist', refreshFailed: true });
      }
      return yield* new ProviderNetworkError({
        provider: 'anilist',
        cause: new Error(`AniList GraphQL errors: ${messages}`),
      });
    }
    if (!response.ok || body.data == null) {
      return yield* new ProviderNetworkError({
        provider: 'anilist',
        cause: new Error(`AniList responded ${response.status} with no data`),
      });
    }

    return body.data;
  });
}

// Writes fired from a tap must not hang for a long Retry-After — sleep at
// most this long, retry once, then surface the error (same policy as Trakt).
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

/** A public (unauthenticated) AniList query — trending etc. */
export function anilistRequest<A>(
  deps: AniListDeps,
  query: string,
  options: Omit<AniListGraphQLOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  return withRateLimitRetry(anilistGraphQL<A>(deps, query, options));
}

/**
 * An authenticated AniList call. Unlike Trakt there is no 401→refresh leg:
 * the implicit-grant token cannot be refreshed, so an auth failure clears
 * the stored session (flipping the provider to disconnected everywhere) and
 * surfaces "reconnect AniList" via `refreshFailed: true`.
 */
export function anilistAuthedRequest<A>(
  deps: AniListDeps,
  query: string,
  options: Omit<AniListGraphQLOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  return Effect.suspend(() => {
    const accessToken = deps.tokens.get()?.accessToken;
    if (accessToken == null) {
      return Effect.fail(
        new ProviderAuthError({ provider: 'anilist', refreshFailed: true }),
      );
    }
    return withRateLimitRetry(
      anilistGraphQL<A>(deps, query, { ...options, accessToken }),
    );
  }).pipe(
    Effect.tapError((error) =>
      error._tag === 'ProviderAuthError'
        ? Effect.sync(() => deps.tokens.clear())
        : Effect.void,
    ),
  );
}
