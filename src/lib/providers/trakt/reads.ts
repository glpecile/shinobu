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
  normalizeSearchResult,
  normalizeStudio,
  normalizeTrendingMovie,
  normalizeTrendingShow,
  normalizeWatchedMovie,
  normalizeWatchedShow,
  type TraktPeopleResponse,
  type TraktSearchResult,
  type TraktStudio,
  type TraktTrendingMovie,
  type TraktTrendingShow,
  type TraktWatchedMovie,
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

/**
 * Text search across movies + TV shows in one public request (plan 0009).
 * Rows Trakt indexes that we don't handle (episodes, people, …) drop out in
 * normalization rather than failing the whole search. `fields=title,aliases`
 * keeps relevance sane — Trakt's default searches overviews/taglines too,
 * which buries exact title matches under plot-keyword noise.
 */
export function searchMedia(
  deps: TraktDeps,
  params: { query: string; limit?: number },
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = params.limit ?? 20;
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktSearchResult[]>(
      deps,
      `/search/movie,show?query=${encodeURIComponent(params.query)}&fields=title,aliases&extended=full,images&limit=${limit}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw
      .map((entry) => normalizeSearchResult(entry, nowIso))
      .filter((item) => item != null);
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

export function getWatchedMovies(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  return traktAuthedRequest<TraktWatchedMovie[]>(
    deps,
    '/sync/watched/movies?extended=full,images',
  ).pipe(Effect.map((movies) => movies.map(normalizeWatchedMovie)));
}
