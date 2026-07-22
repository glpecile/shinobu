import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedDiaryEntry } from '@/types/media';

/**
 * The four diary infinite-query key roots, in one RN-free place so both the
 * provider query-key builders and the details-screen cache scan derive from the
 * same source (and the scan stays unit-testable without pulling the http
 * client). `trakt`/`anilist` are the exact history keys; `letterboxd`/`serializd`
 * are provider roots (every diary query is username-suffixed under them).
 */
export const DIARY_QUERY_ROOTS = {
  trakt: ['trakt', 'history'] as const,
  anilist: ['anilist', 'list-activity'] as const,
  letterboxd: ['letterboxd'] as const,
  serializd: ['serializd'] as const,
};

/** A diary infinite-query page: a flat entry array (Trakt/AniList/Letterboxd)
 * or Serializd's `{ entries, totalPages }` object. */
type DiaryPage = NormalizedDiaryEntry[] | { entries?: NormalizedDiaryEntry[] };

function entriesFromPage(page: DiaryPage): NormalizedDiaryEntry[] {
  return Array.isArray(page) ? page : (page.entries ?? []);
}

/**
 * Resolves a diary row's item from the cached diary infinite queries — the
 * details resolution chain (plan 0016 KTD7) extends here after the search-cache
 * step, since diary items sit in no feed slot, no search, no TMDB cache. Scans
 * every loaded page of all four diary queries for the log whose item id matches;
 * returns the embedded item, or undefined on a cold deep link. Non-diary queries
 * that share the `['serializd']` root (progress) carry no `pages` and are skipped.
 */
export function findInDiaryCache(
  queryClient: QueryClient,
  id: string,
): NormalizedDiaryEntry['item'] | undefined {
  for (const root of Object.values(DIARY_QUERY_ROOTS)) {
    const found = queryClient
      .getQueriesData<{ pages?: DiaryPage[] }>({ queryKey: root })
      .flatMap(([, data]) => (data?.pages ?? []).flatMap(entriesFromPage))
      .find((entry) => entry.item.id === id);
    if (found != null) return found.item;
  }
  return undefined;
}
