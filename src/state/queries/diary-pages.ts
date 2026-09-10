import type { QueryClient } from '@tanstack/react-query';

import {
  watermarkProviders,
  type DiaryProviderState,
} from '@/features/diary/merge';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedDiaryEntry } from '@/types/media';

/**
 * The unified diary is **one** infinite query (the Up Next / watchlist gather
 * shape): its `queryFn` fans out to every connected provider and each page
 * carries one slice per provider that advanced. One loading state, one merge
 * per page, so the screen never sees a half-merged feed
 * (docs/solutions/diary-reshuffles-while-providers-land.md). This module is
 * the page shape plus everything derived from it, RN- and Effect-free so the
 * cursor logic and the details-screen cache scan stay unit-testable without
 * pulling the http client.
 */

/** Root of the one diary query — what the log fan-out invalidates and the
 *  details-screen cache scan reads. Keep it as specific as the query itself:
 *  a broader prefix once matched a sibling infinite query whose pages were
 *  media items, and the scan crashed the details screen reading `.item`. */
export const DIARY_QUERY_ROOT = ['diary'] as const;

export const diaryQueryKeys = {
  /** Keyed by the active provider set and the username-scoped sessions, so
   *  connecting a tracker or reconnecting as another account is a new query,
   *  never the prior account's entries. */
  feed: (
    providers: readonly ProviderId[],
    letterboxdUsername: string,
    serializdUsername: string,
  ) =>
    [
      ...DIARY_QUERY_ROOT,
      providers.join(','),
      letterboxdUsername,
      serializdUsername,
    ] as const,
};

/** The page param: which page each *advancing* provider fetches next. */
export type DiaryCursor = Partial<Record<ProviderId, number>>;

/** One provider's fetch within a page. */
export interface DiarySlice {
  entries: NormalizedDiaryEntry[];
  /** The page to fetch after this one; undefined once exhausted. A failed
   *  fetch keeps its own page so the next advance retries it. */
  next: number | undefined;
  /** The fetch failed — data, never a thrown query (partial-failure contract). */
  error?: string;
}

export interface DiaryPage {
  slices: Partial<Record<ProviderId, DiarySlice>>;
}

export interface DiaryPageState extends DiaryProviderState {
  next: number | undefined;
  error?: string;
}

/**
 * Folds the loaded pages into one state per provider for the merge: every
 * entry fetched so far, and the pagination posture from its latest slice. A
 * provider whose *first* fetch failed drops out (`failed`); one whose later
 * page failed keeps its entries and its place in the watermark, so the next
 * advance retries that page instead of exposing a gap.
 */
export function diaryStates(pages: readonly DiaryPage[]): DiaryPageState[] {
  const byProvider = new Map<ProviderId, DiaryPageState>();
  for (const page of pages) {
    for (const [provider, slice] of Object.entries(page.slices) as Array<
      [ProviderId, DiarySlice]
    >) {
      const entries = [...(byProvider.get(provider)?.entries ?? []), ...slice.entries];
      const failed = slice.error != null && entries.length === 0;
      byProvider.set(provider, {
        provider,
        entries,
        failed,
        hasMore: !failed && slice.next != null,
        next: slice.next,
        error: slice.error,
      });
    }
  }
  return [...byProvider.values()];
}

/** The next page param: the watermark provider(s) and their next page, or
 *  undefined when nobody has more (plan 0016 KTD3). */
export function nextDiaryCursor(pages: readonly DiaryPage[]): DiaryCursor | undefined {
  const states = diaryStates(pages);
  const advance = watermarkProviders(states);
  const cursor: DiaryCursor = {};
  for (const state of states) {
    if (state.next != null && advance.includes(state.provider)) {
      cursor[state.provider] = state.next;
    }
  }
  return Object.keys(cursor).length > 0 ? cursor : undefined;
}

/** Every diary entry in every loaded page of the cached diary query. */
export function cachedDiaryEntries(queryClient: QueryClient): NormalizedDiaryEntry[] {
  return queryClient
    .getQueriesData<{ pages?: DiaryPage[] }>({ queryKey: DIARY_QUERY_ROOT })
    .flatMap(([, data]) => data?.pages ?? [])
    .flatMap((page) => Object.values(page?.slices ?? {}))
    .flatMap((slice) => slice?.entries ?? []);
}

/**
 * Resolves a diary row's item from the cached diary query — the details
 * resolution chain (plan 0016 KTD7) extends here after the search-cache step,
 * since diary items sit in no feed slot, no search, no TMDB cache. Returns the
 * embedded item, or undefined on a cold deep link.
 *
 * The `entry?.item?.id` guard is belt-and-braces: a malformed row must degrade
 * to "Not found", never throw — a resolution helper that throws takes the
 * route's ErrorBoundary with it.
 */
export function findInDiaryCache(
  queryClient: QueryClient,
  id: string,
): NormalizedDiaryEntry['item'] | undefined {
  return cachedDiaryEntries(queryClient).find((entry) => entry?.item?.id === id)?.item;
}
