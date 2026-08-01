import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedMediaItem } from '@/types/media';

/**
 * The search-query key roots, in one RN-free place — same arrangement as
 * `diary-cache.ts`: the provider query-key builders derive their `searchRoot()`
 * from these, and the details-screen cache scan reads them, so the two can't
 * drift and the scan stays unit-testable without pulling the http client.
 */
export const SEARCH_QUERY_ROOTS = {
  trakt: ['trakt', 'search'] as const,
  anilist: ['anilist', 'search'] as const,
  // TMDB is a metadata source, not a provider, but its title search *is* the
  // Movies & TV search section post-detachment — tapped results must resolve
  // on the details screen exactly like tracker-sourced ones.
  tmdb: ['tmdb', 'search'] as const,
};

/**
 * Resolves a tapped search result from the cached search queries — the step in
 * the details resolution chain (plan 0009) that covers items belonging to no
 * feed row. Both providers are scanned: **manga appears in no feed row at
 * all**, so before plan 0024 U8 (AniList root missing here) every manga result
 * opened straight into "Not found". Cold deep links still miss — the
 * provider-fetch fallback stays with plan 0007.
 */
export function findInSearchCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  for (const root of Object.values(SEARCH_QUERY_ROOTS)) {
    const found = queryClient
      .getQueriesData<NormalizedMediaItem[]>({ queryKey: root })
      .flatMap(([, data]) => data ?? [])
      // `item?.id`, for the reason spelled out in `diary-cache.ts`: these roots
      // are prefixes, so a sibling query landing under one gets scanned here
      // too, and a resolution helper must degrade to "Not found" rather than
      // throw and take the route's ErrorBoundary with it.
      .find((item) => item?.id === id);
    if (found != null) return found;
  }
  return undefined;
}
