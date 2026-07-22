import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';

const provider = 'serializd' as const;

export interface SerializdHttpOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Attach `Authorization: Bearer {token}` from the session (writes/progress). */
  auth?: boolean;
}

/**
 * One Serializd round-trip mapped into the ProviderError taxonomy (R17). The
 * app headers (`Origin`/`Referer`/`X-Requested-With`) are NOT set here — they
 * belong to the transport (native adds them per request; the web proxy adds
 * them server-side, KTD4). No refresh/retry policy: Serializd has no refresh
 * token, so a 401 is a dead session (R7).
 *
 *  - 401 → `ProviderAuthError({ refreshFailed: true })` (never retried)
 *  - 429 → `ProviderRateLimitError`
 *  - other non-2xx → `ProviderNetworkError`
 *  - unparseable JSON → `ProviderDecodeError`
 */
export function serializdHttp<A>(
  deps: SerializdDeps,
  path: string,
  options: SerializdHttpOptions = {},
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const token = options.auth === true ? deps.session?.accessToken : undefined;
    if (options.auth === true && (token == null || token === '')) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(`${deps.baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token != null && token !== ''
              ? { Authorization: `Bearer ${token}` }
              : {}),
          },
          ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 401 || response.status === 403) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Serializd responded ${response.status} for ${path}`),
      });
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: () =>
        new ProviderDecodeError({
          provider,
          detail: `unreadable JSON body for ${path}`,
        }),
    });
  });
}
