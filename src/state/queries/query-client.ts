import { QueryClient } from '@tanstack/react-query';

/**
 * Failures a blind retry can never fix — and would make worse. A 429 already
 * got its one polite Retry-After sleep inside the provider layer's http.ts,
 * so retrying again from TanStack Query just burns
 * more of the same rate budget (docs/solutions/anilist-rate-limit-retry-storm.md).
 * Auth failures need a reconnect, not a replay. Effect surfaces these as a
 * FiberFailure whose `name` carries the tagged-error tag.
 */
const NEVER_RETRY = /ProviderRateLimitError|ProviderAuthError/;

/**
 * The genuinely *transient* class: a browser "NetworkError when attempting to
 * fetch resource" / connection reset, i.e. the request never got a response.
 * Unlike a 429 or auth failure, retrying is exactly the right move — the blip
 * is usually gone within a second or two. The home feed fires ~7 concurrent
 * Trakt reads over one multiplexed HTTP/2 connection (watched-shows + the Up
 * Next progress fan-out + trending), so a single connection drop fails them all
 * at once; giving this class a couple extra attempts rides that out
 * (docs/solutions/trakt-transient-network-errors.md).
 */
const TRANSIENT = /ProviderNetworkError/;

function errorLabel(error: unknown): string {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}

export function isRetryable(error: unknown): boolean {
  return !NEVER_RETRY.test(errorLabel(error));
}

export function retryCountFor(error: unknown): number {
  if (!isRetryable(error)) return 0;
  // 3 retries (4 attempts) for transient connection failures, the standard 2
  // for everything else retryable (e.g. a one-off decode hiccup).
  return TRANSIENT.test(errorLabel(error)) ? 3 : 2;
}

const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Exponential backoff with **equal jitter**: half a fixed floor, half random.
 * The jitter is the point — when a burst of reads to one host fails together
 * (one dropped HTTP/2 connection takes every in-flight stream with it), the
 * default fixed delay would retry all of them in the same instant and they'd
 * re-collide. Spreading the retries lets the reconnected pipe absorb them.
 */
export function retryDelay(attemptIndex: number): number {
  const backoff = Math.min(1_000 * 2 ** attemptIndex, MAX_RETRY_DELAY_MS);
  return backoff / 2 + Math.random() * (backoff / 2);
}

/**
 * The app-wide QueryClient (one per app lifetime, created in app/_layout.tsx).
 *
 * `staleTime` floor: home ↔ details navigation remounts every query observer
 * on both screens (`useUnifiedFeed` runs on each), and TanStack Query's
 * default `staleTime: 0` refetched *everything* on every remount — enough to
 * blow AniList's 30 req/min budget from ordinary browsing. One minute keeps
 * navigation free; per-query overrides tune slow-moving reads higher.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) => failureCount < retryCountFor(error),
        retryDelay,
      },
    },
  });
}
