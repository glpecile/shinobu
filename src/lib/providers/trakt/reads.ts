import { Clock, Effect } from 'effect';

import type {
  MediaType,
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedMediaItem,
  NormalizedStudio,
} from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import { traktAuthedRequest, traktRequest } from './api';
import type { TraktDeps } from './deps';
import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeStudio,
  normalizeTrendingMovie,
  normalizeTrendingShow,
  normalizeWatchedShow,
  type TraktPeopleResponse,
  type TraktStudio,
  type TraktTrendingMovie,
  type TraktTrendingShow,
  type TraktWatchedShow,
} from './normalize';

/**
 * The MediaType → URL-segment mapping lives here so screens never branch on
 * provider path shapes; anime films land on the movie endpoint via the same
 * `isFilm` reasoning as log routing.
 */
function traktSegment(type: MediaType): 'movies' | 'shows' {
  return type === 'TV' ? 'shows' : 'movies';
}

/**
 * Public catalogue read — needs only the client id, no OAuth, so the app has
 * something real to show before any provider is connected (plan 0006 §8).
 */
export function getTrendingMovies(
  deps: TraktDeps,
  options: { limit?: number } = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = options.limit ?? 30;
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktTrendingMovie[]>(
      deps,
      `/movies/trending?extended=full,images&limit=${limit}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw.map((entry) => normalizeTrendingMovie(entry, nowIso));
  });
}

export function getTrendingShows(
  deps: TraktDeps,
  options: { limit?: number } = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = options.limit ?? 30;
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktTrendingShow[]>(
      deps,
      `/shows/trending?extended=full,images&limit=${limit}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw.map((entry) => normalizeTrendingShow(entry, nowIso));
  });
}

export interface MediaPeople {
  cast: NormalizedCastMember[];
  crew: NormalizedCrewMember[];
}

/**
 * Cast + crew credits for a detail view — one public request; Trakt's
 * `/people` response carries both sides.
 */
export function getMediaPeople(
  deps: TraktDeps,
  params: {
    type: MediaType;
    traktId: number;
    castLimit?: number;
    crewLimit?: number;
  },
): Effect.Effect<MediaPeople, ProviderError> {
  return traktRequest<TraktPeopleResponse>(
    deps,
    `/${traktSegment(params.type)}/${params.traktId}/people?extended=images`,
  ).pipe(
    Effect.map((response) => ({
      cast: (response.cast ?? [])
        .slice(0, params.castLimit ?? 15)
        .map(normalizeCastEntry),
      crew: normalizeCrew(response.crew).slice(0, params.crewLimit ?? 20),
    })),
  );
}

/** Production studios for a detail view — public endpoint. */
export function getMediaStudios(
  deps: TraktDeps,
  params: { type: MediaType; traktId: number },
): Effect.Effect<NormalizedStudio[], ProviderError> {
  return traktRequest<TraktStudio[]>(
    deps,
    `/${traktSegment(params.type)}/${params.traktId}/studios`,
  ).pipe(Effect.map((studios) => studios.map(normalizeStudio)));
}

export function getWatchedShows(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  return traktAuthedRequest<TraktWatchedShow[]>(
    deps,
    '/sync/watched/shows?extended=full,images',
  ).pipe(Effect.map((shows) => shows.map(normalizeWatchedShow)));
}
