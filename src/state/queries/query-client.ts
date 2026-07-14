import { QueryClient } from '@tanstack/react-query';

/**
 * Failures a blind retry can never fix — and would make worse. A 429 already
 * got its one polite Retry-After sleep inside the provider layer's http.ts,
 * so retrying again from TanStack Query just burns
 * more of the same rate budget (docs/solutions/anilist-rate-limit-retry-storm.md).
 * Auth failures need a reconnect, not a replay. Effect surfaces these as a
 * FiberFailure whose `name` carries the tagged-error tag.
 */
const UNRETRYABLE = /ProviderRateLimitError|ProviderAuthError/;

function isRetryable(error: unknown): boolean {
  const name = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return !UNRETRYABLE.test(name);
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
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
      },
    },
  });
}
