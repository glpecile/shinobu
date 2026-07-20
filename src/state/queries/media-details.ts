import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import {
  getMediaDetails,
  type MediaDetails,
} from '@/lib/providers/media-details';
import { tmdbToken } from '@/lib/providers/tmdb/config';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistDeps } from './anilist';
import {
  cachedAniZipIds,
  cachedTmdbMovieIdByTitle,
  cachedTmdbTvIdByTvdb,
} from './mapping';
import { tmdbDeps } from './tmdb';
import { traktDeps } from './trakt';

/**
 * The one detail-screen metadata query (plan 0014): TMDB-first via the
 * `getMediaDetails` composer, provider failover inside the effect. The
 * header consumes the plain hook (renders immediately, metadata pops in);
 * the credits sections consume the suspense sibling — same key, one fetch.
 */

export const mediaDetailsQueryKeys = {
  all: ['media-details'] as const,
  details: (item: NormalizedMediaItem | undefined) =>
    [
      ...mediaDetailsQueryKeys.all,
      // The item's own id keeps two id-less films (Letterboxd slugs, all
      // externalIds null) from colliding on one cache entry — otherwise a
      // title-resolved TMDB record would leak between them.
      item?.id ?? 'none',
      item?.type ?? 'none',
      item?.isFilm === true,
      // All three ids key the entry: enrichment that discovers a new id
      // (catalogue/identity merges) refetches naturally instead of serving
      // the pre-enrichment result forever.
      item?.externalIds.tmdb ?? null,
      item?.externalIds.trakt ?? null,
      item?.externalIds.anilist ?? null,
    ] as const,
};

// Display metadata churns slowly; an hour keeps back-navigation free.
const DETAILS_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * The TMDB id the composer should use. TV anime arrive with only an AniList
 * id — bridge ani.zip → TVDB → TMDB `/find` (both legs forever-cached).
 * Anime films map straight through ani.zip's own TMDB (movie) id.
 */
async function resolveTmdbId(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
): Promise<number | undefined> {
  if (item.externalIds.tmdb != null) return item.externalIds.tmdb;
  if (tmdbToken() === '') return undefined;

  // A movie with no cross-provider id at all (a Letterboxd watchlist film is
  // slug + title + year) resolves its TMDB id by title+year directly — no
  // tracker connection required, unlike the Trakt text-search enrichment. Only
  // when there's no Trakt id either, whose exact lookup is preferred over this
  // fuzzy search (same guard as mapping.ts's useMovieCatalogueQuery).
  if (
    item.type === 'MOVIE' &&
    item.externalIds.trakt == null &&
    item.title !== ''
  ) {
    return (
      (await cachedTmdbMovieIdByTitle(queryClient, {
        title: item.title,
        year: item.year,
      })) ?? undefined
    );
  }

  if (item.type !== 'ANIME' || item.externalIds.anilist == null) return undefined;

  const ids = await cachedAniZipIds(queryClient, {
    anilistId: item.externalIds.anilist,
  }).catch(() => null);
  if (ids == null) return undefined;
  if (item.isFilm === true) return ids.tmdb ?? undefined;
  if (ids.tvdb == null) return undefined;
  return (await cachedTmdbTvIdByTvdb(queryClient, ids.tvdb)) ?? undefined;
}

function mediaDetailsQuery(
  queryClient: QueryClient,
  item: NormalizedMediaItem | undefined,
) {
  return {
    queryKey: mediaDetailsQueryKeys.details(item),
    queryFn: async (): Promise<MediaDetails> => {
      if (item == null) throw new Error('media-details query ran without an item');
      const tmdbId = await resolveTmdbId(queryClient, item);
      return Effect.runPromise(
        getMediaDetails(
          {
            tmdb: tmdbToken() !== '' ? tmdbDeps() : null,
            trakt: traktDeps(),
            anilist: anilistDeps(),
          },
          {
            type: item.type,
            ...(item.isFilm != null ? { isFilm: item.isFilm } : {}),
            ...(tmdbId != null ? { tmdbId } : {}),
            ...(item.externalIds.trakt != null
              ? { traktId: item.externalIds.trakt }
              : {}),
            ...(item.externalIds.anilist != null
              ? { anilistId: item.externalIds.anilist }
              : {}),
          },
        ),
      );
    },
    staleTime: DETAILS_STALE_TIME_MS,
  };
}

/** Non-suspending variant for the details header metadata merge. */
export function useMediaDetailsQuery(item: NormalizedMediaItem | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...mediaDetailsQuery(queryClient, item),
    enabled: item != null,
  });
}

export function useSuspenseMediaDetailsQuery(item: NormalizedMediaItem) {
  const queryClient = useQueryClient();
  return useSuspenseQuery(mediaDetailsQuery(queryClient, item));
}
