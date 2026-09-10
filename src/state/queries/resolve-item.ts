import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { parseTmdbItemId } from '@/lib/providers/tmdb/normalize';
import type { NormalizedMediaItem } from '@/types/media';

import { findInDiaryCache } from './diary-pages';
import { useMediaDetailsQuery } from './media-details';
import { useMovieCatalogueQuery, useTraktIdentityQuery } from './mapping';
import { findInSearchCache } from './search-cache';
import { tmdbQueryKeys } from './tmdb';
import { findInUpNextCache } from './up-next-cache';
import { useUnifiedFeed } from './use-unified-feed';
import { findInWatchlistCache } from './watchlist-cache';

function findItemById(
  id: string,
  groups: NormalizedMediaItem[][],
): NormalizedMediaItem | undefined {
  return groups.flat().find((item) => item.id === id);
}

/**
 * A card tapped on a person or studio page targets an item that exists in no
 * feed and no search — but it *is* sitting in the cached TMDB page query the
 * viewer just came from, so resolve against those rows (same trick as the
 * search cache above; both page shapes expose `rows[].items`). Trakt
 * identity is backfilled separately (`useTraktIdentityQuery`).
 */
function findInTmdbCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{ rows?: Array<{ items: NormalizedMediaItem[] }> }>({
      queryKey: tmdbQueryKeys.all,
    })
    // `row?.items ?? []` and `item?.id`: `tmdbQueryKeys.all` is a prefix, so a
    // sibling TMDB query whose rows are shaped differently gets scanned here
    // too — and `rows.flatMap((row) => row.items)` on a row without `items`
    // yields `undefined` entries that crash the whole details screen. Same
    // failure `diary-pages.ts` documents; a resolution helper degrades to
    // "Not found", never throws.
    .flatMap(([, data]) => data?.rows?.flatMap((row) => row?.items ?? []) ?? [])
    .find((item) => item?.id === id);
}

/**
 * The item behind a `/details/[id]` or `/episode/[id]` route, resolved
 * **cache-only** from every surface a card can be tapped on: the personal
 * feed first (its copy carries real progress), then Up Next, search, diary,
 * the merged watchlist and the TMDB person/studio pages. Items whose origin
 * carries no metadata (a Letterboxd watchlist film is a slug + title + year)
 * get a catalogue record resolved by title+year merged in; TMDB-keyed
 * filmography credits get their Trakt identity discovered the same way.
 *
 * A cold deep link to a TMDB-minted id (`/details/tmdb-tv-32905` refreshed in
 * a browser tab) is the one non-cache step: it fetches the catalogue record.
 *
 * `undefined` while the feed or that fetch is still loading — the caller
 * tells "loading" and "not found" apart with `isLoading`.
 */
export function useResolvedMediaItem(id: string): {
  item: NormalizedMediaItem | undefined;
  isLoading: boolean;
  refetchFeed: () => Promise<unknown>;
} {
  // includeHidden: hidden items must still resolve here — the Manage
  // Trackers hidden list links straight to the details screen.
  const feed = useUnifiedFeed({ includeHidden: true });
  const queryClient = useQueryClient();
  const resolvedItem =
    findItemById(id, [
      // Personal feed first: an item can appear in both a personal row and a
      // public catalogue row, and the personal copy carries real progress.
      feed.yourWatchlist,
      feed.trendingMovies,
      feed.trendingShows,
      feed.seasonalAnime,
    ]) ??
    // Up Next / Continue Watching cards. They used to resolve incidentally out
    // of the `yourShows`/`yourAnime` slots (the same show sat in both
    // surfaces); those rows are gone, so the gather that produced the card is
    // now what answers for it. Cache-only, like every step here.
    findInUpNextCache(queryClient, id) ??
    // Search results belong to no feed slot (plan 0009) — and manga belongs to
    // no feed row at all, so this is the only way it resolves (plan 0024 U8).
    findInSearchCache(queryClient, id) ??
    // Diary rows live in no feed slot and no search — resolve them from the
    // cached diary pages the viewer just scrolled (plan 0016 KTD7/R6).
    findInDiaryCache(queryClient, id) ??
    // The merged watchlist belongs to no feed slot (plan 0031 KTD-11 keeps it
    // out of one deliberately), so its Trakt- and AniList-sourced cards would
    // hit "Not found" without this step. Cache-only: opening a details screen
    // never triggers the gather.
    findInWatchlistCache(queryClient, id) ??
    findInTmdbCache(queryClient, id);
  // Cold deep link (a refreshed browser tab, a shared URL): nothing above
  // holds the item, but a TMDB-minted id says exactly what to fetch, so a
  // stub carrying just that id rides the same catalogue query the details
  // screen runs for the resolved item — same key, one request. Only for
  // TMDB ids, the only kind a signed-out viewer can reach: tracker-keyed ids
  // still need a session to fetch by.
  const deepLink = resolvedItem == null && !feed.isLoading ? parseTmdbItemId(id) : null;
  const deepLinkDetails = useMediaDetailsQuery(
    deepLink != null ? tmdbStub(id, deepLink) : undefined,
  );
  const cachedOrFetched = resolvedItem ?? deepLinkDetails.data?.catalogue ?? undefined;
  const catalogue = useMovieCatalogueQuery(cachedOrFetched);
  const traktIdentity = useTraktIdentityQuery(cachedOrFetched);
  const enriched = catalogue.data ?? traktIdentity.data;
  return {
    item:
      cachedOrFetched != null && enriched != null
        ? mergeCatalogueMetadata(cachedOrFetched, enriched)
        : cachedOrFetched,
    isLoading: feed.isLoading || (deepLink != null && deepLinkDetails.isPending),
    refetchFeed: feed.refetch,
  };
}

function tmdbStub(
  id: string,
  parsed: { kind: 'movie' | 'tv'; tmdbId: number },
): NormalizedMediaItem {
  return {
    id,
    title: '',
    coverImage: '',
    type: parsed.kind === 'movie' ? 'MOVIE' : 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: new Date(0).toISOString(),
    externalIds: { tmdb: parsed.tmdbId },
  };
}
