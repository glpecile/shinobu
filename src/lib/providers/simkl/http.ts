import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { SIMKL_API_BASE_URL, simklStandardParams } from './config';
import type { SimklDeps } from './deps';

const provider = 'simkl' as const;

export interface SimklHttpOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Attached as `Authorization: Bearer …` when present. */
  accessToken?: string;
  /** Defaults to the API host; calendar reads pass `SIMKL_CDN_BASE_URL`. */
  baseUrl?: string;
  /**
   * Ran on a 2xx before the body decodes; returning an error fails the effect
   * with it. How `reads.ts` asserts `/sync/all-items` never silently went
   * paginated (plan 0034 U3): headers are transport-level, so the check must
   * live here — the decoded body can't witness them.
   */
  inspectResponse?: (headers: Headers) => ProviderError | undefined;
}

/**
 * Simkl requires `client_id`/`app-name`/`app-version` as URL params on every
 * request, CDN calls included. `path` may already carry a query string
 * (`/search/tv?q=…`) — the standard params are merged in, never appended
 * blindly.
 */
function buildSimklUrl(clientId: string, baseUrl: string, path: string): string {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(simklStandardParams(clientId))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Simkl signals its ~20-second per-user write lock as `400` with a
 * `rate_limit` body (plan 0034 KTD-3), distinct from the 429 request-rate cap.
 * Both must map to `ProviderRateLimitError` so the retry predicate treats them
 * identically — a blind retry inside the lock window can only collide again
 * (the AniList lesson, docs/solutions/anilist-rate-limit-retry-storm.md).
 */
function isRateLimitBody(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    return [parsed.error, parsed.message].some(
      (value) => typeof value === 'string' && value.includes('rate_limit'),
    );
  } catch {
    return text.includes('rate_limit');
  }
}

/**
 * Lowest layer: one Simkl HTTP round-trip mapped into the ProviderError
 * taxonomy. There is deliberately NO refresh/retry policy here or anywhere
 * above it — Simkl tokens live ~5 years with no refresh grant (KTD-2), so a
 * 401 is a dead session (`refreshFailed: true` → "reconnect Simkl"), never a
 * refresh trigger.
 */
export function simklHttp<A>(
  deps: SimklDeps,
  path: string,
  options: SimklHttpOptions = {},
): Effect.Effect<A, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(buildSimklUrl(deps.clientId, options.baseUrl ?? SIMKL_API_BASE_URL, path), {
          method: options.method ?? 'GET',
          headers: {
            // Content-Type only travels with a body: bare GETs (CDN calendar
            // included) stay CORS-simple requests — no pointless preflight.
            ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
            ...(options.accessToken != null && options.accessToken !== ''
              ? { Authorization: `Bearer ${options.accessToken}` }
              : {}),
          },
          ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 401) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      return yield* new ProviderRateLimitError({
        provider,
        ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? { retryAfterMs: retryAfterSeconds * 1000 }
          : {}),
      });
    }
    if (response.status === 400) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (cause) => new ProviderNetworkError({ provider, cause, status: 400 }),
      });
      if (isRateLimitBody(text)) {
        return yield* new ProviderRateLimitError({ provider });
      }
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Simkl responded 400 for ${path}`),
        status: 400,
      });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Simkl responded ${response.status} for ${path}`),
        status: response.status,
      });
    }

    if (options.inspectResponse != null) {
      const rejection = options.inspectResponse(response.headers);
      if (rejection != null) {
        return yield* rejection;
      }
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: () =>
        new ProviderDecodeError({
          provider,
          detail: `non-JSON body from ${path}`,
        }),
    });
  });
}
