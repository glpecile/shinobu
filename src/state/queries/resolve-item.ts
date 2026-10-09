import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { parseAniListItemId } from '@/lib/providers/anilist/normalize';
import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { parseSimklItemId } from '@/lib/providers/simkl/normalize';
import { parseTmdbItemId } from '@/lib/providers/tmdb/normalize';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, useAnimeByIdQuery } from './anilist';
import { findInDiaryCache } from './diary-pages';
import { useMediaDetailsQuery } from './media-details';
import { findInLetterboxdListsCache, useLetterboxdFilmTmdbQuery } from './letterboxd';
import { findInSerializdListsCache } from './serializd';
import { useMovieCatalogueQuery, useSimklLookupQuery, useTraktIdentityQuery } from './mapping';
import { findInSearchCache } from './search-cache';
import { tmdbQueryKeys } from './tmdb';
import { useTraktItemQuery } from './trakt';
import { findInUpNextCache } from './up-next-cache';
import { useUnifiedFeed } from './use-unified-feed';
import { findInWatchlistCache } from './watchlist-cache';

function findItemById(
  id: string,
  groups: NormalizedMediaItem[][],
  mediaType?: MediaType,
): NormalizedMediaItem | undefined {
  return groups.flat().find((item) => item.id === id && (mediaType == null || item.type === mediaType));
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
 * A card tapped on the seasons explorer past the home row's page — any other
 * cour, format or page lives only in the explorer's infinite query.
 */
function findInSeasonalPagesCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{ pages?: NormalizedMediaItem[][] }>({
      queryKey: anilistQueryKeys.seasonalAnimePagesRoot(),
    })
    .flatMap(([, data]) => data?.pages?.flat() ?? [])
    .find((item) => item?.id === id);
}

/**
 * The item behind a provider-qualified detail or episode route, resolved
 * from the cached surfaces a card can be tapped on: the personal
 * feed first (its copy carries real progress), then Up Next, search, diary,
 * the merged watchlist and the TMDB person/studio pages. Items whose origin
 * carries no metadata (a Letterboxd watchlist film is a slug + title + year)
 * get a catalogue record resolved by title+year merged in; TMDB-keyed
 * filmography credits get their Trakt identity discovered the same way.
 *
 * Cold TMDB, AniList, Simkl and typed Trakt links fetch public records by ID. Incoming
 * IMDb links use Simkl's ID lookup; Letterboxd film links first resolve their
 * exact TMDB movie ID from the native public film page. Serializd IDs resolve
 * as TMDB TV IDs through Simkl's public lookup.
 *
 * `undefined` while the feed or that fetch is still loading — the caller
 * tells "loading" and "not found" apart with `isLoading`.
 */
export function useResolvedMediaItem(id: string, mediaType?: MediaType): {
  item: NormalizedMediaItem | undefined;
  isLoading: boolean;
  refetchFeed: () => Promise<unknown>;
} {
  // includeHidden: hidden items must still resolve here — the Manage
  // Trackers hidden list links straight to the details screen.
  const feed = useUnifiedFeed({ includeHidden: true });
  const queryClient = useQueryClient();
  const cachedItem =
    findItemById(id, [
      // Personal feed first: an item can appear in both a personal row and a
      // public catalogue row, and the personal copy carries real progress.
      feed.yourWatchlist,
      feed.trendingMovies,
      feed.trendingShows,
      feed.seasonalAnime,
      feed.animeMovies,
    ], mediaType) ??
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
    findInLetterboxdListsCache(queryClient, id) ??
    findInSerializdListsCache(queryClient, id) ??
    findInTmdbCache(queryClient, id) ??
    findInSeasonalPagesCache(queryClient, id);
  const resolvedItem = mediaType == null || cachedItem?.type === mediaType ? cachedItem : undefined;
  // Cold deep link (a refreshed browser tab, a shared URL): nothing above
  // holds the item, but a TMDB-minted id says exactly what to fetch, so a
  // stub carrying just that id rides the same catalogue query the details
  // screen runs for the resolved item — same key, one request. Only for
  // TMDB ids; the other public ID lookups are handled below.
  // Public ID reads are independent of Home. Cached personal data still wins
  // above when it arrives, without making a cold detail wait for every feed row.
  const deepLink = resolvedItem == null ? parseTmdbItemId(id) : null;
  const deepLinkDetails = useMediaDetailsQuery(
    deepLink != null ? tmdbStub(id, deepLink) : undefined,
  );
  // The AniList twin: an AniList-minted id is public data too, and the seasons
  // explorer is reachable signed out, so its links must survive a refresh.
  const anilistDeepLink =
    resolvedItem == null ? parseAniListItemId(id) : null;
  const anilistDeepLinkItem = useAnimeByIdQuery(anilistDeepLink);
  // And the Simkl one: a variant poster or a shared link to a Simkl-minted id.
  const simklDeepLink = resolvedItem == null ? parseSimklItemId(id) : null;
  const simklDeepLinkItem = useSimklLookupQuery(
    simklDeepLink != null ? { simkl: simklDeepLink } : null,
  );
  const traktDeepLink = resolvedItem == null ? /^trakt-([1-9][0-9]*)$/.exec(id)?.[1] : undefined;
  const traktDeepLinkItem = useTraktItemQuery(traktDeepLink == null ? null : Number(traktDeepLink), mediaType);
  const imdb = resolvedItem == null ? /^imdb-(tt[0-9]+)$/.exec(id)?.[1] : undefined;
  const letterboxd = resolvedItem == null ? /^letterboxd-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)?.[1] : undefined;
  // Serializd media IDs are TMDB TV IDs, not private tracker identities.
  const serializd = resolvedItem == null ? /^serializd-([1-9][0-9]*)$/.exec(id)?.[1] : undefined;
  const filmTmdb = useLetterboxdFilmTmdbQuery(letterboxd ?? null);
  const externalItem = useSimklLookupQuery(
    imdb != null ? { imdb } : filmTmdb.data != null ? { tmdb: filmTmdb.data, type: 'movie' }
      : serializd != null ? { tmdb: Number(serializd), type: 'show' } : null,
  );
  const external = externalItem.data == null ? undefined : {
    ...externalItem.data,
    externalIds: {
      ...externalItem.data.externalIds,
      ...(imdb != null ? { imdb } : {}),
      ...(filmTmdb.data != null ? { tmdb: filmTmdb.data } : {}),
      ...(serializd != null ? { tmdb: Number(serializd) } : {}),
      ...(letterboxd != null ? { letterboxd } : {}),
    },
  };
  const cachedOrFetched =
    resolvedItem ??
    deepLinkDetails.data?.catalogue ??
    anilistDeepLinkItem.data ??
    simklDeepLinkItem.data ??
    traktDeepLinkItem.data ??
    external ??
    undefined;
  const catalogue = useMovieCatalogueQuery(cachedOrFetched);
  const traktIdentity = useTraktIdentityQuery(cachedOrFetched);
  const enriched = catalogue.data ?? traktIdentity.data;
  return {
    item:
      cachedOrFetched != null && enriched != null
        ? mergeCatalogueMetadata(cachedOrFetched, enriched)
        : cachedOrFetched,
    isLoading:
      feed.isLoading ||
      (deepLink != null && deepLinkDetails.isPending) ||
      (anilistDeepLink != null && anilistDeepLinkItem.isPending) ||
      (letterboxd != null && process.env.EXPO_OS !== 'web' && filmTmdb.isPending) ||
      ((imdb != null || filmTmdb.data != null || serializd != null) && externalItem.isPending) ||
      (traktDeepLinkItem.isEnabled && traktDeepLinkItem.isPending) ||
      (simklDeepLink != null && simklDeepLinkItem.isPending),
    refetchFeed: feed.refetch,
  };
}

/**
 * The record a cold detail route fetches for a TMDB, AniList or Simkl id, from the
 * same queries — so previewing that page also warms it. `undefined` for any
 * other id, and while loading.
 */
export function useDeepLinkItem(id: string): NormalizedMediaItem | undefined {
  const tmdb = parseTmdbItemId(id);
  const details = useMediaDetailsQuery(tmdb != null ? tmdbStub(id, tmdb) : undefined);
  const anime = useAnimeByIdQuery(parseAniListItemId(id));
  const simkl = parseSimklItemId(id);
  const simklItem = useSimklLookupQuery(simkl != null ? { simkl } : null);
  return details.data?.catalogue ?? anime.data ?? simklItem.data ?? undefined;
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
