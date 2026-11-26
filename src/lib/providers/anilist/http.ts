import * as Clock from 'effect/Clock';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { SHINOBU_WEB_DOMAIN } from '@/lib/config';
import { optionalNullable } from '@/lib/providers/schema';

import { RATE_LIMIT_MAX_RETRY_DELAY_MS } from '@/lib/providers/rate-limits';
import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { Provider } from '@/lib/providers/types';
import type { AniListDeps } from './deps';

// Lives here (not config.ts) so the Effect layer stays free of react-native
// imports — config.ts branches on Platform, which bun:test cannot load.
export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const cooldowns = new WeakMap<AniListDeps['fetch'], number>();

/**
 * AniList's edge returns 403 without a `Referer` (docs/solutions/anilist-api-outage-403.md).
 * Browsers ignore forbidden headers and send the real origin; native needs this explicitly.
 */
export const ANILIST_REFERER = `${SHINOBU_WEB_DOMAIN}/`;

export interface AniListGraphQLOptions {
  variables?: Record<string, unknown>;
  accessToken?: string;
}

const graphQLResponse = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: optionalNullable(
    Schema.Array(
      Schema.Struct({
        message: optionalNullable(Schema.String),
        status: optionalNullable(Schema.Number),
      }),
    ),
  ),
  error: optionalNullable(
    Schema.Struct({
      messages: optionalNullable(Schema.Array(Schema.String)),
    }),
  ),
});

export function anilistGraphQL<A>(
  deps: AniListDeps,
  query: string,
  options: AniListGraphQLOptions = {},
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const remaining = (cooldowns.get(deps.fetch) ?? 0) - now;
    if (remaining > 0)
      return yield* new ProviderRateLimitError({
        provider: Provider.AniList,
        retryAfterMs: remaining,
      });
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        deps.fetch(ANILIST_GRAPHQL_URL, {
          signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Referer: ANILIST_REFERER,
            ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify({
            query,
            variables: options.variables ?? {},
          }),
        }),
      catch: (cause) => new ProviderNetworkError({ provider: Provider.AniList, cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider: Provider.AniList, refreshFailed: true });
    }
    const rateLimitError = () => {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      const reset = Number(response.headers.get('X-RateLimit-Reset')) * 1000;
      const retryAfterMs =
        Math.max(
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 0,
          Number.isFinite(reset) && reset > now ? reset - now : 0,
        ) || 60_000;
      cooldowns.set(deps.fetch, Math.max(cooldowns.get(deps.fetch) ?? 0, now + retryAfterMs));
      return new ProviderRateLimitError({
        provider: Provider.AniList,
        retryAfterMs,
      });
    };

    const responseError = (detail: string) => {
      if (response.status === 429) return rateLimitError();
      return response.ok
        ? new ProviderDecodeError({ provider: Provider.AniList, detail })
        : new ProviderNetworkError({
            provider: Provider.AniList,
            status: response.status,
            cause: new Error(`AniList refused the request (HTTP ${response.status}): ${detail}`),
          });
    };

    const json = yield* Effect.tryPromise({
      try: (): Promise<unknown> => response.json(),
      catch: () => responseError(`non-JSON GraphQL response (HTTP ${response.status})`),
    });

    const body = yield* Schema.decodeUnknownEffect(graphQLResponse)(json).pipe(
      Effect.mapError((error) => responseError(`invalid GraphQL response: ${error.message}`)),
    );

    // An explicit API-disabled response describes a refusal, even if an edge
    // returns 429. Without that evidence, 429 remains a rate limit.
    const apiDisabled =
      body.errors?.some((error) =>
        /AniList API has been temporarily disabled/i.test(error.message ?? ''),
      ) === true;
    if (response.status === 429 && !apiDisabled) {
      return yield* rateLimitError();
    }

    // AniList's parser rejects some valid GraphQL syntax with a 500 envelope.
    // Replaying the same rejected operation only spends more of the rate budget.
    if (body.error?.messages?.some((message) => /^Bad request[.!]?$/i.test(message)) === true) {
      return yield* new ProviderNetworkError({
        provider: Provider.AniList,
        status: response.status,
        retryable: false,
        cause: new Error(
          `AniList rejected the query (HTTP ${response.status}): ${body.error.messages.join('; ')}`,
        ),
      });
    }

    if (body.errors != null && body.errors.length > 0) {
      const messages = body.errors.map((e) => e.message ?? 'unknown').join('; ');
      // AniList reports a dead/invalid bearer token as a GraphQL error
      // ("Invalid token"), not always as a bare 401.
      if (
        !apiDisabled &&
        body.errors.some((e) => e.status === 401 || /invalid token/i.test(e.message ?? ''))
      ) {
        return yield* new ProviderAuthError({ provider: Provider.AniList, refreshFailed: true });
      }
      return yield* new ProviderNetworkError({
        provider: Provider.AniList,
        status: response.status,
        cause: new Error(
          response.ok
            ? `AniList GraphQL errors: ${messages}`
            : `AniList refused the request (HTTP ${response.status}): ${messages}`,
        ),
      });
    }
    if (!response.ok || body.data == null) {
      return yield* new ProviderNetworkError({
        provider: Provider.AniList,
        status: response.status,
        cause: new Error(`AniList responded ${response.status} with no data`),
      });
    }

    return body.data as A;
  });
}

function withRateLimitRetry<A>(
  effect: Effect.Effect<A, ProviderError>,
): Effect.Effect<A, ProviderError> {
  return effect.pipe(
    Effect.catchTag('ProviderRateLimitError', (error) => {
      const delay = error.retryAfterMs ?? 60_000;
      if (delay > RATE_LIMIT_MAX_RETRY_DELAY_MS) return Effect.fail(error);
      return Effect.sleep(Duration.millis(delay)).pipe(Effect.andThen(effect));
    }),
  );
}

export function anilistRequest<A>(
  deps: AniListDeps,
  query: string,
  options: Omit<AniListGraphQLOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  return withRateLimitRetry(anilistGraphQL<A>(deps, query, options));
}

export function anilistAuthedRequest<A>(
  deps: AniListDeps,
  query: string,
  options: Omit<AniListGraphQLOptions, 'accessToken'> = {},
): Effect.Effect<A, ProviderError> {
  return Effect.suspend(() => {
    const accessToken = deps.tokens.get()?.accessToken;
    if (accessToken == null) {
      return Effect.fail(
        new ProviderAuthError({ provider: Provider.AniList, refreshFailed: true }),
      );
    }
    return withRateLimitRetry(anilistGraphQL<A>(deps, query, { ...options, accessToken }));
  }).pipe(
    Effect.tapError((error) =>
      error._tag === 'ProviderAuthError' ? Effect.sync(() => deps.tokens.clear()) : Effect.void,
    ),
  );
}
