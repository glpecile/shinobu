import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedDiaryEntry } from '@/types/media';

/**
 * The three diary infinite-query key roots, in one RN-free place so both the
 * provider query-key builders and the details-screen cache scan derive from the
 * same source (and the scan stays unit-testable without pulling the http
 * client). `trakt`/`anilist` are the exact history keys; `letterboxd` is the
 * provider root (every diary query is username-suffixed under it).
 */
export const DIARY_QUERY_ROOTS = {
  trakt: ['trakt', 'history'] as const,
  anilist: ['anilist', 'list-activity'] as const,
  letterboxd: ['letterboxd'] as const,
};

/**
 * Resolves a diary row's item from the cached diary infinite queries — the
 * details resolution chain (plan 0016 KTD7) extends here after the search-cache
 * step, since diary items sit in no feed slot, no search, no TMDB cache. Scans
 * every loaded page of all three diary queries for the log whose item id
 * matches; returns the embedded item, or undefined on a cold deep link.
 */
export function findInDiaryCache(
  queryClient: QueryClient,
  id: string,
): NormalizedDiaryEntry['item'] | undefined {
  for (const root of Object.values(DIARY_QUERY_ROOTS)) {
    const found = queryClient
      .getQueriesData<{ pages?: NormalizedDiaryEntry[][] }>({ queryKey: root })
      .flatMap(([, data]) => data?.pages?.flat() ?? [])
      .find((entry) => entry.item.id === id);
    if (found != null) return found.item;
  }
  return undefined;
}
