import { Clock, Effect } from 'effect';

import type {
  MediaType,
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  NormalizedSeason,
  NormalizedStudio,
  ReleaseCalendar,
} from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import type {
  SeasonLayout,
  SeasonSlot,
} from '@/lib/providers/mapping/season-layout';
import { isDateOnly } from '@/lib/time/has-aired';
import { traktAuthedRequest, traktRequest } from './api';
import type { TraktDeps } from './deps';
import {
  normalizeCalendarMovieRow,
  normalizeCalendarShowRow,
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
  normalizeWatchlistRow,
  orderSeasons,
  type NormalizedMediaImages,
  type TraktCalendarEpisode,
  type TraktCalendarMovieRow,
  type TraktCalendarRelease,
  type TraktCalendarShowRow,
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
  type TraktWatchlistRow,
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
 * Trakt enforces pagination across `/sync/*` — on `/sync/watched/*` since
 * 2026-06-30 (docs/solutions/trakt-watched-endpoints-2026-api-changes.md) and
 * on `/sync/watchlist` per discussion #681
 * (docs/solutions/trakt-watchlist-pagination-2026.md). Loop pages until a short
 * page, capped so a huge library can't turn one query into dozens of
 * round-trips.
 *
 * Deliberately one loop for every paginated sync read: a second hand-rolled one
 * is how the short-page stop condition and the page cap diverge (plan 0031
 * KTD-16).
 */
const SYNC_MAX_PAGES = 10;

function getPagedSync<Raw>(
  deps: TraktDeps,
  path: string,
  params: { extended?: string; limit: number },
): Effect.Effect<Raw[], ProviderError> {
  return Effect.gen(function* () {
    const all: Raw[] = [];
    for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
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

interface TraktSettingsResponse {
  user?: { username?: string | null } | null;
}

/**
 * The connected account's Trakt username, for "connected as who" on Manage
 * Trackers. A Trakt session is an OAuth token and carries no handle of its own,
 * and `/users/settings` is the only authenticated endpoint that names the
 * account behind the token.
 *
 * Returns `null` rather than failing when the payload doesn't carry a username:
 * the caller degrades to a plain "Connected" line, and a settings-shape change
 * must never take the card down with it.
 */
export function getViewerUsername(
  deps: TraktDeps,
): Effect.Effect<string | null, ProviderError> {
  return traktAuthedRequest<TraktSettingsResponse>(deps, '/users/settings').pipe(
    Effect.map((data) => data.user?.username ?? null),
  );
}

export function getWatchedShows(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  // `extended=progress` restores the per-season episode breakdown the 2026 API
  // change dropped from the default response — `normalizeWatchedShow` derives
  // `currentProgress` from it. It caps pages at 100 items (vs 250 default).
  return getPagedSync<TraktWatchedShow>(deps, '/sync/watched/shows', {
    extended: 'progress',
    limit: 100,
  }).pipe(Effect.map((shows) => shows.map(normalizeWatchedShow)));
}

/**
 * Trakt's maximum page size since 2026-06-15 (cut from 1,000) — discussion
 * #681, `docs/solutions/trakt-watchlist-pagination-2026.md`. Sending it
 * explicitly matters twice over: the ceiling is the fewest round-trips
 * available, and omitting `page`/`limit` silently drops the response to 100
 * items whatever the blueprint's `📄 Pagination Optional` badge still says.
 */
const WATCHLIST_PAGE_LIMIT = 250;

export interface TraktWatchlistParams {
  /** Trakt's own path segment; `all` is one request for movies + shows. */
  type?: 'all' | 'movies' | 'shows';
  sortBy?: 'rank' | 'added' | 'released' | 'title';
  sortHow?: 'asc' | 'desc';
}

/**
 * The user's Trakt watchlist (plan 0031 U11). Explicitly paginated on every
 * request — never "one call returns everything" — and looped through
 * `getPagedSync` so the stop condition and the page cap are the ones every
 * other `/sync/*` read uses (KTD-16).
 *
 * `extended=full,images` is the blueprint's global option and #775's image
 * removal named only `/sync/watched/*` and `/users/:id/watched/*`, so watchlist
 * rows should still carry art; if a response ever arrives artless the
 * per-card `useTraktMediaImages` recovery already covers it at no design cost.
 *
 * Season and episode rows drop in normalization rather than failing the read.
 */
export function getWatchlist(
  deps: TraktDeps,
  params: TraktWatchlistParams = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const type = params.type ?? 'all';
  const sortBy = params.sortBy ?? 'added';
  const sortHow = params.sortHow ?? 'desc';
  return Effect.gen(function* () {
    const rows = yield* getPagedSync<TraktWatchlistRow>(
      deps,
      `/sync/watchlist/${type}/${sortBy}/${sortHow}`,
      { extended: 'full,images', limit: WATCHLIST_PAGE_LIMIT },
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return rows
      .map((row) => normalizeWatchlistRow(row, nowIso))
      .filter((item) => item != null);
  });
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
  return getPagedSync<TraktWatchedMovie>(deps, '/sync/watched/movies', {
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
 * The season/episode-count skeleton only — the fallback arbiter for placing an
 * ani.zip row when TMDB is unavailable (plan 0027; see
 * `lib/providers/mapping/season-layout.ts`). Deliberately *not*
 * `getShowSeasons`: that pulls every episode of every season (`extended=
 * full,episodes`), which for a long-runner is a large payload to answer "how
 * many episodes does season 2 hold". Public catalogue call, client-id only.
 *
 * `episode_count`, not `aired_episodes`: this is a question about the show's
 * structure, so an episode that aired an hour ago must still place correctly.
 */
export function getShowSeasonLayout(
  deps: TraktDeps,
  params: { traktId: number },
): Effect.Effect<SeasonLayout, ProviderError> {
  return traktRequest<Array<{ number?: number; episode_count?: number }>>(
    deps,
    `/shows/${params.traktId}/seasons?extended=full`,
  ).pipe(
    Effect.map((seasons) =>
      seasons.flatMap((season): SeasonSlot[] =>
        season.number == null || season.episode_count == null
          ? []
          : [{ season: season.number, episodeCount: season.episode_count }],
      ),
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

// ---- My calendars (plan 0030) ----

/**
 * Trakt rejects a calendar range longer than 33 days, so the cap is enforced
 * here: a caller asking for more gets 33 days of results rather than a 4xx
 * that would take the whole Calendar section down.
 */
const CALENDAR_MAX_DAYS = 33;

/** Calendar's window is today … today+6 — seven local days (plan 0030 R1). */
const CALENDAR_DEFAULT_DAYS = 7;

export interface TraktCalendarParams {
  /** Bare `YYYY-MM-DD`; defaults to the user's *local* today. */
  startDate?: string;
  /** Clamped to 1…33 (`CALENDAR_MAX_DAYS`). */
  days?: number;
}

/**
 * The local calendar day of `now`, never the UTC one: the window a user means
 * by "this week" is the one their own clock is in, and `toISOString().slice(0,
 * 10)` would start the range on yesterday for anyone west of Greenwich after
 * their local evening.
 */
function localCalendarDate(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The `{start_date}/{days}` path segments for any calendar read — exported
 * because the clamping (and the local-day default) is the part worth testing
 * without a round-trip.
 */
export function traktCalendarRange(
  params: TraktCalendarParams,
  now: Date,
): { startDate: string; days: number } {
  const requested = params.days ?? CALENDAR_DEFAULT_DAYS;
  const days = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), CALENDAR_MAX_DAYS)
    : CALENDAR_DEFAULT_DAYS;
  // A start date that isn't a bare calendar day would make Trakt 4xx the whole
  // request; fall back to today rather than fail the section over a bad caller.
  const startDate =
    params.startDate != null && isDateOnly(params.startDate)
      ? params.startDate
      : localCalendarDate(now);
  return { startDate, days };
}

/**
 * Upcoming episodes of every show the user has watched **or watchlisted**, in
 * one authed call (KTD-2) — which is why this replaces the pooled
 * `progress/watched` fan as Calendar's Trakt source: that fan caps at 20 shows
 * and can only speak for shows already started. Trakt applies the user's
 * hidden-from-calendar setting server-side, so nothing is re-filtered here.
 *
 * `extended=full,images` for the episode's title/runtime and the show's
 * poster — calendars still carry `images`, unlike `/sync/watched/*` since the
 * 2026 change (docs/solutions/trakt-watched-endpoints-2026-api-changes.md).
 */
export function getMyShowsCalendar(
  deps: TraktDeps,
  params: TraktCalendarParams = {},
): Effect.Effect<TraktCalendarEpisode[], ProviderError> {
  return Effect.gen(function* () {
    const now = new Date(yield* Clock.currentTimeMillis);
    const { startDate, days } = traktCalendarRange(params, now);
    const raw = yield* traktAuthedRequest<TraktCalendarShowRow[]>(
      deps,
      `/calendars/my/shows/${startDate}/${days}?extended=full,images`,
    );
    const nowIso = now.toISOString();
    return raw
      .map((row) => normalizeCalendarShowRow(row, nowIso))
      .filter((entry) => entry != null);
  });
}

/**
 * The three movie calendars differ only in path segment and in which
 * `ReleaseCalendar` slot their `released` date fills — the payload shape is
 * identical, so they share one read.
 */
function getMyMovieCalendar(
  deps: TraktDeps,
  segment: 'movies' | 'streaming' | 'dvd',
  kind: keyof ReleaseCalendar,
  params: TraktCalendarParams,
): Effect.Effect<TraktCalendarRelease[], ProviderError> {
  return Effect.gen(function* () {
    const now = new Date(yield* Clock.currentTimeMillis);
    const { startDate, days } = traktCalendarRange(params, now);
    const raw = yield* traktAuthedRequest<TraktCalendarMovieRow[]>(
      deps,
      `/calendars/my/${segment}/${startDate}/${days}?extended=full,images`,
    );
    const nowIso = now.toISOString();
    return raw
      .map((row) => normalizeCalendarMovieRow(row, kind, nowIso))
      .filter((entry) => entry != null);
  });
}

/** Theatrical release dates for the user's watchlisted/collected films. */
export function getMyMoviesCalendar(
  deps: TraktDeps,
  params: TraktCalendarParams = {},
): Effect.Effect<TraktCalendarRelease[], ProviderError> {
  return getMyMovieCalendar(deps, 'movies', 'theatrical', params);
}

/**
 * Streaming (digital) release dates. `streaming` is the calendar *type* Trakt
 * actually names — `digital` 404s with "'type' is required", which is what the
 * published summaries disagreed about
 * (docs/solutions/trakt-streaming-calendar-path.md). If this ever stops
 * answering, KTD-4's fallback is TMDB's `releaseCalendar.digital`, which the
 * details screen already renders — no new normalization either way.
 */
export function getMyStreamingCalendar(
  deps: TraktDeps,
  params: TraktCalendarParams = {},
): Effect.Effect<TraktCalendarRelease[], ProviderError> {
  return getMyMovieCalendar(deps, 'streaming', 'digital', params);
}

/**
 * Physical (disc) release dates — carried for completeness; plan 0030 R3
 * renders only theatrical and digital rows in v1.
 */
export function getMyDvdCalendar(
  deps: TraktDeps,
  params: TraktCalendarParams = {},
): Effect.Effect<TraktCalendarRelease[], ProviderError> {
  return getMyMovieCalendar(deps, 'dvd', 'physical', params);
}
