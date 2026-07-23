import { Clock, Effect } from 'effect';

import type {
  MediaType,
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  NormalizedSeason,
  NormalizedStudio,
} from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import { traktAuthedRequest, traktRequest } from './api';
import type { TraktDeps } from './deps';
import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeHistoryItem,
  normalizeMediaImages,
  normalizeSearchResult,
  normalizeSeason,
  normalizeStudio,
  normalizeTrendingMovie,
  normalizeTrendingShow,
  normalizeWatchedMovie,
  normalizeWatchedProgress,
  normalizeWatchedShow,
  orderSeasons,
  type NormalizedMediaImages,
  type TraktHistoryItem,
  type TraktImages,
  type TraktPeopleResponse,
  type TraktSearchResult,
  type TraktShowProgress,
  type TraktShowProgressResult,
  type TraktShowSeason,
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

/**
 * Resolve a Trakt item from a foreign id (`/search/{id_type}/{id}`) — how an
 * ani.zip-mapped anime acquires its Trakt identity before the log fan-out
 * (plan 0011). Public read; null when Trakt doesn't index the id.
 */
export function lookupByExternalId(
  deps: TraktDeps,
  params: {
    source: 'tvdb' | 'tmdb' | 'imdb';
    id: number | string;
    kind: 'movie' | 'show';
  },
): Effect.Effect<NormalizedMediaItem | null, ProviderError> {
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktSearchResult[]>(
      deps,
      `/search/${params.source}/${params.id}?type=${params.kind}&extended=full,images`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return (
      raw
        .map((entry) => normalizeSearchResult(entry, nowIso))
        .find((item) => item != null) ?? null
    );
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

/**
 * Trakt enforces pagination on `/sync/watched/*` since 2026-06-30 — a single
 * request no longer returns the full history (docs/solutions/
 * trakt-watched-endpoints-2026-api-changes.md). Loop pages until a short page,
 * capped so a huge library can't turn one query into dozens of round-trips.
 */
const WATCHED_MAX_PAGES = 10;

function getWatchedPages<Raw>(
  deps: TraktDeps,
  path: string,
  params: { extended?: string; limit: number },
): Effect.Effect<Raw[], ProviderError> {
  return Effect.gen(function* () {
    const all: Raw[] = [];
    for (let page = 1; page <= WATCHED_MAX_PAGES; page++) {
      const batch = yield* traktAuthedRequest<Raw[]>(
        deps,
        `${path}?${params.extended != null ? `extended=${params.extended}&` : ''}page=${page}&limit=${params.limit}`,
      );
      all.push(...batch);
      if (batch.length < params.limit) break;
    }
    return all;
  });
}

export function getWatchedShows(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  // `extended=progress` restores the per-season episode breakdown the 2026 API
  // change dropped from the default response — `normalizeWatchedShow` derives
  // `currentProgress` from it. It caps pages at 100 items (vs 250 default).
  return getWatchedPages<TraktWatchedShow>(deps, '/sync/watched/shows', {
    extended: 'progress',
    limit: 100,
  }).pipe(Effect.map((shows) => shows.map(normalizeWatchedShow)));
}

/**
 * One page of the authenticated watch history — the Diary source (plan 0016
 * U1). Unlike `/sync/watched/*` (a deduped library snapshot), `/sync/history`
 * is per-log and reverse-chronological: a binge day or a rewatch is several
 * rows. One page per infinite-query cursor (no internal loop — the diary feed
 * hook owns pagination); a short page signals end-of-history. `extended=full`
 * carries the movie/show metadata the rows would otherwise omit.
 */
export function getHistory(
  deps: TraktDeps,
  params: { page: number; limit?: number },
): Effect.Effect<NormalizedDiaryEntry[], ProviderError> {
  const limit = params.limit ?? 50;
  return traktAuthedRequest<TraktHistoryItem[]>(
    deps,
    `/sync/history?extended=full&page=${params.page}&limit=${limit}`,
  ).pipe(
    Effect.map((rows) =>
      rows
        .map((row) => normalizeHistoryItem(row))
        .filter((entry): entry is NormalizedDiaryEntry => entry != null),
    ),
  );
}

export function getWatchedMovies(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  // No extended param: the 2026 default already carries full movie metadata,
  // and `plays` lives on the wrapper. Images are gone either way — see
  // `getMediaImages` for how feed art is recovered.
  return getWatchedPages<TraktWatchedMovie>(deps, '/sync/watched/movies', {
    limit: 250,
  }).pipe(Effect.map((movies) => movies.map(normalizeWatchedMovie)));
}

/**
 * Poster/backdrop for one item from the public catalogue detail endpoint —
 * the recovery path for watched-feed items, since Trakt's 2026 API change
 * removed images from `/sync/watched/*` responses entirely. Fetched lazily
 * per item (`useTraktMediaImages`), never for the whole library up front.
 */
export function getMediaImages(
  deps: TraktDeps,
  params: { type: MediaType; traktId: number },
): Effect.Effect<NormalizedMediaImages, ProviderError> {
  return traktRequest<{ images?: TraktImages }>(
    deps,
    `/${traktSegment(params.type)}/${params.traktId}?extended=full,images`,
  ).pipe(Effect.map(normalizeMediaImages));
}

/**
 * Full seasons + episodes for one show (plan 0010). Public catalogue call —
 * client-id only, no OAuth — so the seasons view renders even before any
 * provider is connected (no watch checkmarks in that case). Specials sort last
 * via `orderSeasons`.
 */
export function getShowSeasons(
  deps: TraktDeps,
  params: { traktId: number },
): Effect.Effect<NormalizedSeason[], ProviderError> {
  return traktRequest<TraktShowSeason[]>(
    deps,
    `/shows/${params.traktId}/seasons?extended=full,episodes`,
  ).pipe(
    Effect.map((seasons) =>
      orderSeasons(seasons.map(normalizeSeason)),
    ),
  );
}

/**
 * Per-episode watched completion for one show, from the authenticated
 * `/shows/:id/progress/watched` endpoint. Targeted (one show), so the seasons
 * view doesn't rescan the whole watched-shows list; empty key set when
 * nothing's watched yet.
 *
 * `extended=full` costs nothing extra in requests and upgrades the response's
 * `next_episode` pointer from bare ids to a full episode object — `first_aired`
 * and `runtime` included — which is what Up Next classifies per show (plan
 * 0019 KTD-1). One authed call per show, already invalidated after a log.
 */
export function getShowWatchedProgress(
  deps: TraktDeps,
  params: { traktId: number },
): Effect.Effect<TraktShowProgressResult, ProviderError> {
  return traktAuthedRequest<TraktShowProgress>(
    deps,
    `/shows/${params.traktId}/progress/watched?extended=full`,
  ).pipe(Effect.map(normalizeWatchedProgress));
}
