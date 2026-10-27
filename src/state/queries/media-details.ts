import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import {
  getMediaDetails,
  type MediaDetailsDeps,
  type MediaDetails,
} from '@/lib/providers/media-details';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistDeps, anilistRelationsQuery } from './anilist';
import {
  cachedAniZipIds,
  cachedTmdbMovieIdByTitle,
  cachedTmdbTvIdByTvdb,
} from './mapping';
import { seasonsSourceFor, showSeasonsQueryOptions } from './show-seasons';
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
      item?.tmdbTvVariant ?? null,
      // Enrichment that discovers a new id refetches instead of serving the
      // pre-enrichment result forever. With a TMDB id and token, TMDB answers
      // and the other ids only feed its failover, so a Trakt id arriving after
      // the screen mounts doesn't refetch and re-suspend the credits.
      item?.externalIds.tmdb ?? null,
      ...(item?.externalIds.tmdb != null && tmdbToken() !== ''
        ? []
        : [item?.externalIds.trakt ?? null, item?.externalIds.anilist ?? null]),
    ] as const,
};

// Display metadata churns slowly; an hour keeps back-navigation free. Kept
// cached as long, so reopening a title within the hour skips the skeleton.
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
  if (item.tmdbTvVariant != null) return undefined;
  if (tmdbToken() === '') return undefined;

  // Letterboxd film pages resolve their own typed relationship. Other id-less
  // movies use title/year only when no exact tracker identity is available.
  if (
    item.type === 'MOVIE' &&
    item.externalIds.letterboxd == null &&
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

/**
 * Which provider legs `getMediaDetails` gets, resolved once per call so the
 * gate is one function rather than inlined at the call site (plan 0034
 * KTD-8). `tmdb`/`trakt` are each null exactly when their credential is
 * absent — `getMediaDetails`'s failover already tolerates either leg missing,
 * so a Trakt-less build (no BYO creds post-detachment) simply has one fewer
 * failover source instead of a doomed unauthenticated request.
 */
export function buildMediaDetailsDeps(): MediaDetailsDeps {
  return {
    tmdb: tmdbToken() !== '' ? tmdbDeps() : null,
    trakt: getClientIdForProvider('trakt') !== '' ? traktDeps() : null,
    anilist: anilistDeps(),
  };
}

/** Shared with cache-only observers so they retain the real query fetcher. */
export function mediaDetailsQuery(
  queryClient: QueryClient,
  item: NormalizedMediaItem | undefined,
) {
  return {
    queryKey: mediaDetailsQueryKeys.details(item),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<MediaDetails> => {
      if (item == null) throw new Error('media-details query ran without an item');
      const tmdbId = await resolveTmdbId(queryClient, item);
      return Effect.runPromise(
        getMediaDetails(
          buildMediaDetailsDeps(),
          {
            type: item.type,
            ...(item.tmdbTvVariant != null ? { tmdbTvVariant: item.tmdbTvVariant } : {}),
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
        { signal },
      );
    },
    staleTime: DETAILS_STALE_TIME_MS,
    gcTime: DETAILS_STALE_TIME_MS,
  };
}

/**
 * Starts the reads the details screen suspends on (credits, seasons, AniList
 * relations and episodes) together on press, so they run during the push
 * transition instead of after the screen mounts.
 */
export function usePrefetchMediaDetails() {
  const queryClient = useQueryClient();
  return (item: NormalizedMediaItem) => {
    void queryClient.prefetchQuery(mediaDetailsQuery(queryClient, item));
    const anilistId = item.externalIds.anilist;
    if (anilistId != null) {
      void queryClient.prefetchQuery(
        anilistRelationsQuery(queryClient, { mediaId: anilistId, type: item.type }),
      );
    }
    const seasons = item.type === 'TV' ? seasonsSourceFor(item) : null;
    if (seasons != null) void queryClient.prefetchQuery(showSeasonsQueryOptions(seasons));
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
