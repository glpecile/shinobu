import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedDiaryEntry } from '@/types/media';

/**
 * The five diary infinite-query key roots, in one RN-free place so both the
 * provider query-key builders and the details-screen cache scan derive from the
 * same source (and the scan stays unit-testable without pulling the http
 * client). `trakt`/`anilist` are the exact history keys; `letterboxd`/`serializd`
 * name the diary segment too, and every diary query is username-suffixed under
 * that. `simkl` nests under the all-items prefix so the write-side snapshot
 * invalidation covers it (`simklQueryKeys.diary`).
 *
 * **These must stay as specific as the diary query itself.** They were once the
 * bare provider roots (`['letterboxd']`, `['serializd']`), which made
 * `getQueriesData` match every *sibling* query the provider owns — including
 * `letterboxdQueryKeys.watchlistPages`, an infinite query whose pages are
 * `NormalizedMediaItem[]` rather than diary entries. `findInDiaryCache` then
 * read `.item` off a media item and crashed the details screen with
 * "Cannot read property 'id' of undefined". It was latent while only the
 * Letterboxd watchlist screen populated that key, and fired on nearly every
 * item once the cross-provider gather (plan 0031 U13) started warming it from
 * the home feed.
 */
export const DIARY_QUERY_ROOTS = {
  trakt: ['trakt', 'history'] as const,
  anilist: ['anilist', 'list-activity'] as const,
  letterboxd: ['letterboxd', 'diary'] as const,
  serializd: ['serializd', 'diary'] as const,
  simkl: ['simkl', 'all-items', 'diary'] as const,
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
 * every loaded page of all five diary queries for the log whose item id matches;
 * returns the embedded item, or undefined on a cold deep link. Non-diary queries
 * carrying no `pages` are skipped.
 *
 * The `entry?.item?.id` guard is belt-and-braces next to the narrowed roots
 * above: the roots stop a foreign query from being *scanned*, and this stops a
 * foreign or malformed row from *crashing the whole details screen* if one ever
 * lands under a diary key again. A resolution helper returning `undefined` is a
 * "Not found" card; one that throws takes the route's ErrorBoundary with it.
 */
export function findInDiaryCache(
  queryClient: QueryClient,
  id: string,
): NormalizedDiaryEntry['item'] | undefined {
  for (const root of Object.values(DIARY_QUERY_ROOTS)) {
    const found = queryClient
      .getQueriesData<{ pages?: DiaryPage[] }>({ queryKey: root })
      .flatMap(([, data]) => (data?.pages ?? []).flatMap(entriesFromPage))
      .find((entry) => entry?.item?.id === id);
    if (found != null) return found.item;
  }
  return undefined;
}
