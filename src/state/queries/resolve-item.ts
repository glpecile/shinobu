import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { parseHardcoverSlugItemId } from '@/lib/media-link';
import { parseAniListItemId } from '@/lib/providers/anilist/normalize';
import { normalizeHardcoverBook, parseHardcoverItemId } from '@/lib/providers/hardcover/normalize';
import type { SeasonalAnimePage } from '@/lib/providers/anilist/reads';
import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { parseSimklItemId } from '@/lib/providers/simkl/normalize';
import { parseTmdbItemId } from '@/lib/providers/tmdb/normalize';
import type { MediaType, NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, findInCurrentMangaCache, useAnimeByIdQuery } from './anilist';
import { findInDiaryCache } from './diary-pages';
import {
  findInHardcoverLibraryCache,
  findInHardcoverSearchCache,
  useHardcoverBookIdBySlugQuery,
} from './hardcover';
import { useMediaDetailsQuery } from './media-details';
import { findInLetterboxdListsCache, useLetterboxdFilmQuery } from './letterboxd';
import { findInSerializdListsCache, findInSerializdUpcomingCache } from './serializd';
import {
  useMovieCatalogueQuery,
  useSimklAnimeIdsQuery,
  useSimklLookupQuery,
  useTraktIdentityQuery,
} from './mapping';
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
  for (const group of groups) {
    const found = group.find((item) => item?.id === id && (mediaType == null || item.type === mediaType));
    if (found != null) return found;
  }
  return undefined;
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
  for (const [, data] of queryClient.getQueriesData<{ rows?: Array<{ items: NormalizedMediaItem[] }> }>({
    queryKey: tmdbQueryKeys.all,
  })) {
    // The prefix also matches sibling queries with differently shaped rows. Skip rows without
    // items.
    for (const row of data?.rows ?? []) {
      const found = Array.isArray(row?.items) ? row.items.find((item) => item?.id === id) : undefined;
      if (found != null) return found;
    }
  }
  return undefined;
}

/**
 * A card tapped on the seasons explorer past the home row's page — any other
 * cour, format or page lives only in the explorer's infinite query.
 */
function findInSeasonalPagesCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  for (const [, data] of queryClient.getQueriesData<{ pages?: SeasonalAnimePage[] }>({
    queryKey: anilistQueryKeys.seasonalAnimePagesRoot(),
  })) {
    for (const page of data?.pages ?? []) {
      const found = Array.isArray(page?.items) ? page.items.find((item) => item?.id === id) : undefined;
      if (found != null) return found;
    }
  }
  return undefined;
}

/**
 * Resolve a routed item from cached personal data first, then from the surfaces that can open
 * a card.
 */
export function useResolvedMediaItem(id: string, mediaType?: MediaType): {
  item: NormalizedMediaItem | undefined;
  isLoading: boolean;
} {
  const feed = useUnifiedFeed();
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
    // Up Next can hold a card absent from the personal feed.
    findInUpNextCache(queryClient, id) ??
    findInCurrentMangaCache(queryClient, id) ??
    findInHardcoverLibraryCache(queryClient, id) ??
    // Search results belong to no feed slot (plan 0009), and a manga that is
    // neither being read nor on the reading list resolves only here.
    findInSearchCache(queryClient, id) ??
    findInHardcoverSearchCache(queryClient, id) ??
    // Diary rows live in no feed slot and no search — resolve them from the
    // cached diary pages the viewer just scrolled (plan 0016 KTD7/R6).
    findInDiaryCache(queryClient, id) ??
    // Merged watchlist cards resolve from their own cache entry.
    findInWatchlistCache(queryClient, id) ??
    findInLetterboxdListsCache(queryClient, id) ??
    findInSerializdListsCache(queryClient, id) ??
    findInSerializdUpcomingCache(queryClient, id) ??
    findInTmdbCache(queryClient, id) ??
    findInSeasonalPagesCache(queryClient, id);
  const resolvedItem = mediaType == null || cachedItem?.type === mediaType ? cachedItem : undefined;
  // On a cold deep link, a provider-qualified id is enough for the matching detail read.
  const deepLink = resolvedItem == null ? parseTmdbItemId(id) : null;
  // A Hardcover book rides the same query: its record is the book's catalogue.
  // A `hardcover.app/books/{slug}` link resolves its id first.
  const hardcoverSlug = resolvedItem == null ? parseHardcoverSlugItemId(id) : null;
  const hardcoverSlugId = useHardcoverBookIdBySlugQuery(hardcoverSlug);
  const hardcoverBook = resolvedItem == null ? parseHardcoverItemId(id) ?? hardcoverSlugId.data ?? null : null;
  const deepLinkDetails = useMediaDetailsQuery(
    deepLink != null ? tmdbStub(id, deepLink) : hardcoverBook != null ? normalizeHardcoverBook({ id: hardcoverBook }, new Date(0).toISOString()) : undefined,
  );
  // The AniList twin: an AniList-minted id is public data too, and the seasons
  // explorer is reachable signed out, so its links must survive a refresh.
  const anilistDeepLink = parseAniListItemId(id);
  const anilistDeepLinkItem = useAnimeByIdQuery(anilistDeepLink, mediaType ?? resolvedItem?.type);
  const simklDeepLink = resolvedItem == null ? parseSimklItemId(id) : null;
  const simklLookup = useSimklLookupQuery(
    simklDeepLink != null ? { simkl: simklDeepLink } : null,
  );
  const simklAnimeIds = useSimklAnimeIdsQuery(
    simklLookup.data?.type === 'ANIME' ? simklDeepLink : null,
  );
  const simklDeepLinkItem = simklLookup.data != null && simklAnimeIds.data != null
    ? { ...simklLookup.data, externalIds: { ...simklAnimeIds.data, ...simklLookup.data.externalIds } }
    : simklLookup.data ?? undefined;
  // A tracker's anime (a Simkl library row) carries art and ids, no synopsis,
  // genres or other titles. Its AniList record describes the same cour, which
  // TMDB's whole-series record does not. `isFilm` stays the tracker's: it routes writes.
  const trackedAnime = resolvedItem ?? simklDeepLinkItem;
  const courRecord = useAnimeByIdQuery(
    anilistDeepLink == null && trackedAnime?.type === 'ANIME'
      ? trackedAnime.externalIds.anilist ?? null
      : null,
  ).data;
  const withCourRecord = trackedAnime != null && courRecord != null
    ? mergeCatalogueMetadata(
        { ...trackedAnime, titles: { ...courRecord.titles, ...trackedAnime.titles } },
        courRecord,
      )
    : undefined;
  const traktDeepLink = resolvedItem == null ? /^trakt-([1-9][0-9]*)$/.exec(id)?.[1] : undefined;
  const traktDeepLinkItem = useTraktItemQuery(traktDeepLink == null ? null : Number(traktDeepLink), mediaType);
  const imdb = resolvedItem == null ? /^imdb-(tt[0-9]+)$/.exec(id)?.[1] : undefined;
  const letterboxd = /^letterboxd-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)?.[1];
  // Serializd media IDs are TMDB TV IDs, not private tracker identities.
  const serializd = resolvedItem == null ? /^serializd-([1-9][0-9]*)$/.exec(id)?.[1] : undefined;
  const film = useLetterboxdFilmQuery(letterboxd ?? null);
  const externalItem = useSimklLookupQuery(
    imdb != null ? { imdb }
      : serializd != null ? { tmdb: Number(serializd), type: 'show' } : null,
  );
  const external = externalItem.data == null ? undefined : {
    ...externalItem.data,
    externalIds: {
      ...externalItem.data.externalIds,
      ...(imdb != null ? { imdb } : {}),
      ...(serializd != null ? { tmdb: Number(serializd) } : {}),
    },
  };
  const cachedOrFetched =
    (resolvedItem != null && film.data != null
      ? { ...mergeCatalogueMetadata(resolvedItem, film.data), tmdbTvVariant: film.data.tmdbTvVariant }
      : resolvedItem != null && anilistDeepLinkItem.data != null
        ? mergeCatalogueMetadata({ ...anilistDeepLinkItem.data, ...resolvedItem }, anilistDeepLinkItem.data)
        : withCourRecord ?? resolvedItem) ??
    film.data ??
    deepLinkDetails.data?.catalogue ??
    anilistDeepLinkItem.data ??
    simklDeepLinkItem ??
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
      ((deepLink != null || hardcoverBook != null) && deepLinkDetails.isPending) ||
      (hardcoverSlug != null && hardcoverSlugId.isPending) ||
      (anilistDeepLink != null && resolvedItem == null && anilistDeepLinkItem.isPending) ||
      (letterboxd != null && resolvedItem == null && film.isPending) ||
      ((imdb != null || serializd != null) && externalItem.isPending) ||
      (traktDeepLinkItem.isEnabled && traktDeepLinkItem.isPending) ||
      (simklDeepLink != null && simklLookup.isPending),
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
