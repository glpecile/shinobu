import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import {
  RATE_LIMIT_DEFAULT_RETRY_AFTER_MS,
  RATE_LIMIT_MAX_RETRY_DELAY_MS,
} from '@/lib/providers/rate-limits';
import { optionalNullable } from '@/lib/providers/schema';
import { Provider } from '@/lib/providers/types';
import { coalescedRefreshSession } from './auth';
import { HARDCOVER_GRAPHQL_URL } from './config';
import type { HardcoverDeps } from './deps';

const provider = Provider.Hardcover;

export interface HardcoverGraphQLOptions {
  variables?: Record<string, unknown>;
}

const graphQLResponse = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: optionalNullable(
    Schema.Array(Schema.Struct({ message: optionalNullable(Schema.String) })),
  ),
});

/** Seconds from a `Retry-After` header, in ms. Absent when unreadable. */
export function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Lowest layer: one GraphQL round trip with `accessToken`, mapped into the
 * ProviderError taxonomy. Hardcover reports failures as HTTP statuses and as
 * a 200 whose body carries `errors[]`. No refresh or retry here.
 */
function hardcoverGraphQL<A>(
  deps: HardcoverDeps,
  accessToken: string,
  query: string,
  options: HardcoverGraphQLOptions,
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        deps.fetch(HARDCOVER_GRAPHQL_URL, {
          signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query, variables: options.variables ?? {} }),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider, refreshFailed: false });
    }
    if (response.status === 429) {
      const delay = retryAfterMs(response.headers);
      return yield* new ProviderRateLimitError({
        provider,
        ...(delay != null ? { retryAfterMs: delay } : {}),
      });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider,
        status: response.status,
        // 503 is the one status Hardcover documents as safe to retry.
        retryable: response.status === 503,
        cause: new Error(`Hardcover responded ${response.status}`),
      });
    }

    const json = yield* Effect.tryPromise({
      try: (): Promise<unknown> => response.json(),
      catch: () => new ProviderDecodeError({ provider, detail: 'non-JSON GraphQL response' }),
    });
    const body = yield* Schema.decodeUnknownEffect(graphQLResponse)(json).pipe(
      Effect.mapError(
        (error) =>
          new ProviderDecodeError({ provider, detail: `invalid GraphQL response: ${error.message}` }),
      ),
    );
    if (body.errors != null && body.errors.length > 0) {
      return yield* new ProviderNetworkError({
        provider,
        status: response.status,
        retryable: false,
        cause: new Error(
          `Hardcover GraphQL errors: ${body.errors.map((e) => e.message ?? 'unknown').join('; ')}`,
        ),
      });
    }
    if (body.data == null) {
      return yield* new ProviderDecodeError({ provider, detail: 'GraphQL response with no data' });
    }
    return body.data as A;
  });
}

/**
 * An authenticated Hardcover call. Every Hardcover call is one: the API has
 * no unauthenticated read. A 401 refreshes the token once, shared by every
 * concurrent caller, and the request runs again with the new token. A 429
 * waits out a short `Retry-After` once. A 429 means the request did not run,
 * so the second attempt is safe for a mutation too.
 */
export function hardcoverRequest<A>(
  deps: HardcoverDeps,
  query: string,
  options: HardcoverGraphQLOptions = {},
): Effect.Effect<A, ProviderError> {
  const dead = new ProviderAuthError({ provider, refreshFailed: true });
  // Suspended so each attempt reads the token when it runs: the second
  // attempt is built before the refresh and must send the rotated token.
  const attempt = (afterRefresh: boolean): Effect.Effect<A, ProviderError> =>
    Effect.suspend(() => {
      const session = deps.tokens.get();
      if (session == null || session.reconnectNeeded === true) return Effect.fail(dead);
      const { accessToken } = session;
      return hardcoverGraphQL<A>(deps, accessToken, query, options).pipe(
        Effect.catchTag('ProviderAuthError', () =>
          afterRefresh
            ? Effect.fail(dead)
            : coalescedRefreshSession(deps, accessToken).pipe(Effect.andThen(attempt(true))),
        ),
      );
    });

  const effect = attempt(false);
  return effect.pipe(
    Effect.catchTag('ProviderRateLimitError', (error) => {
      const delay = error.retryAfterMs ?? RATE_LIMIT_DEFAULT_RETRY_AFTER_MS;
      if (delay > RATE_LIMIT_MAX_RETRY_DELAY_MS) return Effect.fail(error);
      return Effect.sleep(Duration.millis(delay)).pipe(Effect.andThen(effect));
    }),
  );
}
