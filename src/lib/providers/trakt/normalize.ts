import type {
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  NormalizedSeason,
  NormalizedStudio,
  ReleaseCalendar,
} from '@/types/media';
import { isDateOnly } from '@/lib/time/has-aired';

/** Raw Trakt payload shapes — these never escape lib/providers (AGENTS.md Data Contract). */

export interface TraktIds {
  trakt?: number;
  slug?: string;
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
}

/** From `?extended=images`: arrays of CDN paths, scheme-less (e.g. "walter.trakt.tv/..."). */
export interface TraktImages {
  poster?: string[];
  fanart?: string[];
}

/** Fields from `?extended=full` shared by movies and shows. */
interface TraktExtendedFields {
  overview?: string;
  /** Minutes; for shows this is a typical episode's runtime. */
  runtime?: number;
  genres?: string[];
  /** Community rating, 0–10 float. */
  rating?: number;
}

export interface TraktMovie extends TraktExtendedFields {
  title: string;
  year?: number;
  ids: TraktIds;
  images?: TraktImages;
  /**
   * Theatrical release, bare `YYYY-MM-DD` (movies only — a show's equivalent
   * is its episodes' `first_aired`). Rides along on every movie read, which
   * all request `extended=full`. Feeds the unreleased-film log gate on
   * surfaces that never load the TMDB catalogue, e.g. the card-actions sheet.
   */
  released?: string;
}

export interface TraktShow extends TraktExtendedFields {
  title: string;
  year?: number;
  ids: TraktIds;
  aired_episodes?: number;
  images?: TraktImages;
}

export interface TraktTrendingMovie {
  watchers: number;
  movie: TraktMovie;
}

export interface TraktTrendingShow {
  watchers: number;
  show: TraktShow;
}

export interface TraktWatchedMovie {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  movie: TraktMovie;
}

export interface TraktWatchedShow {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  show: TraktShow;
  seasons?: {
    number: number;
    episodes: { number: number; last_watched_at: string }[];
  }[];
}

/** Trakt CDN paths are scheme-less ("walter.trakt.tv/...") — prefix https. */
function imageUrl(paths: string[] | undefined): string {
  const path = paths?.[0];
  if (path == null) return '';
  return path.startsWith('http') ? path : `https://${path}`;
}

export interface NormalizedMediaImages {
  coverImage: string;
  backdropImage?: string;
}

/**
 * Poster/backdrop from any raw movie/show payload. Trakt's 2026 API change
 * removed images from `/sync/watched/*`, so watched items recover art through
 * a per-item catalogue lookup normalized here (`getMediaImages`).
 */
export function normalizeMediaImages(raw: {
  images?: TraktImages;
}): NormalizedMediaImages {
  return {
    coverImage: imageUrl(raw.images?.poster),
    ...(raw.images?.fanart != null && raw.images.fanart.length > 0
      ? { backdropImage: imageUrl(raw.images.fanart) }
      : {}),
  };
}

/**
 * The optional detail fields shared by every movie/show normalizer. Spread
 * into the item so absent raw fields stay absent (no `undefined` keys under
 * exactOptionalPropertyTypes-style expectations).
 */
function detailFields(
  raw: TraktMovie | TraktShow,
): Partial<NormalizedMediaItem> {
  return {
    ...(raw.images?.fanart != null && raw.images.fanart.length > 0
      ? { backdropImage: imageUrl(raw.images.fanart) }
      : {}),
    ...(raw.overview != null ? { overview: raw.overview } : {}),
    ...(raw.year != null ? { year: raw.year } : {}),
    ...(raw.runtime != null ? { runtime: raw.runtime } : {}),
    ...(raw.genres != null ? { genres: raw.genres } : {}),
    ...(raw.rating != null ? { rating: raw.rating } : {}),
  };
}

/**
 * TVDB/IMDB ride along with trakt/tmdb: they're the bridge ids that map an
 * item into AniList's world via ani.zip (plan 0011 decision 5).
 */
function externalIdsFrom(ids: TraktIds): NormalizedMediaItem['externalIds'] {
  return {
    ...(ids.trakt != null ? { trakt: ids.trakt } : {}),
    ...(ids.tmdb != null ? { tmdb: ids.tmdb } : {}),
    ...(ids.tvdb != null ? { tvdb: ids.tvdb } : {}),
    ...(ids.imdb != null ? { imdb: ids.imdb } : {}),
  };
}

/**
 * `nowIso` keeps these pure: catalogue entries (trending, search) carry no
 * timestamp of their own, and the read effect supplies the instant from
 * Effect's Clock.
 */
export function normalizeMovie(
  raw: TraktMovie,
  nowIso: string,
): NormalizedMediaItem {
  return {
    id: `trakt-${raw.ids.trakt}`,
    title: raw.title,
    coverImage: imageUrl(raw.images?.poster),
    ...detailFields(raw),
    ...(raw.released != null && raw.released !== ''
      ? { releaseDate: raw.released }
      : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: nowIso,
    externalIds: externalIdsFrom(raw.ids),
  };
}

export function normalizeShow(
  raw: TraktShow,
  nowIso: string,
): NormalizedMediaItem {
  return {
    id: `trakt-${raw.ids.trakt}`,
    title: raw.title,
    coverImage: imageUrl(raw.images?.poster),
    ...detailFields(raw),
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    ...(raw.aired_episodes != null
      ? { totalEpisodes: raw.aired_episodes }
      : {}),
    lastUpdated: nowIso,
    externalIds: externalIdsFrom(raw.ids),
  };
}

export function normalizeTrendingMovie(
  raw: TraktTrendingMovie,
  nowIso: string,
): NormalizedMediaItem {
  return normalizeMovie(raw.movie, nowIso);
}

export function normalizeTrendingShow(
  raw: TraktTrendingShow,
  nowIso: string,
): NormalizedMediaItem {
  return normalizeShow(raw.show, nowIso);
}

/**
 * From `/search/movie,show`. `type` is widened to `string` because Trakt's
 * search can index other row kinds (episode, person, list) — anything we don't
 * handle normalizes to `null` and drops out, never throws.
 */
export interface TraktSearchResult {
  type: string;
  score?: number;
  movie?: TraktMovie;
  show?: TraktShow;
}

export function normalizeSearchResult(
  raw: TraktSearchResult,
  nowIso: string,
): NormalizedMediaItem | null {
  if (raw.type === 'movie' && raw.movie != null) {
    return normalizeMovie(raw.movie, nowIso);
  }
  if (raw.type === 'show' && raw.show != null) {
    return normalizeShow(raw.show, nowIso);
  }
  return null;
}

/** From `/movies|shows/:id/people?extended=images`. */
export interface TraktPerson {
  name: string;
  ids: TraktIds;
  images?: { headshot?: string[] };
}

export interface TraktCastEntry {
  /** Current API sends `characters: string[]`; older payloads a single `character`. */
  characters?: string[];
  character?: string;
  person: TraktPerson;
}

export interface TraktCrewEntry {
  /** Current API sends `jobs: string[]`; older payloads a single `job`. */
  jobs?: string[];
  job?: string;
  person: TraktPerson;
}

/** Crew is keyed by department ("directing", "camera", "costume & wardrobe"…). */
export interface TraktPeopleResponse {
  cast?: TraktCastEntry[];
  crew?: Record<string, TraktCrewEntry[] | undefined>;
}

function personId(person: TraktPerson): string {
  return `trakt-person-${person.ids.trakt ?? person.ids.slug}`;
}

export function normalizeCastEntry(raw: TraktCastEntry): NormalizedCastMember {
  return {
    id: personId(raw.person),
    name: raw.person.name,
    character: raw.characters?.join(', ') ?? raw.character ?? '',
    headshot: imageUrl(raw.person.images?.headshot),
    ...(raw.person.ids.tmdb != null ? { tmdbId: raw.person.ids.tmdb } : {}),
  };
}

/** Higher-billing departments surface first; unknown ones sink to the end. */
const CREW_DEPARTMENT_ORDER = [
  'directing',
  'writing',
  'production',
  'editing',
  'camera',
  'sound',
  'art',
  'costume & wardrobe',
  'visual effects',
];

/**
 * Flattens the department-keyed crew map into one billing-ordered list, one
 * entry per person — someone credited in several departments (director who
 * also edits) gets their jobs merged instead of appearing twice.
 */
export function normalizeCrew(
  raw: TraktPeopleResponse['crew'],
): NormalizedCrewMember[] {
  if (raw == null) return [];

  const byPerson = new Map<string, { member: NormalizedCrewMember; jobs: string[] }>();
  const departments = [
    ...CREW_DEPARTMENT_ORDER.filter((department) => department in raw),
    ...Object.keys(raw).filter(
      (department) => !CREW_DEPARTMENT_ORDER.includes(department),
    ),
  ];

  for (const department of departments) {
    for (const entry of raw[department] ?? []) {
      const id = personId(entry.person);
      const jobs = entry.jobs ?? (entry.job != null ? [entry.job] : []);
      const existing = byPerson.get(id);
      if (existing != null) {
        existing.jobs.push(...jobs);
      } else {
        byPerson.set(id, {
          member: {
            id,
            name: entry.person.name,
            job: '',
            headshot: imageUrl(entry.person.images?.headshot),
            ...(entry.person.ids.tmdb != null
              ? { tmdbId: entry.person.ids.tmdb }
              : {}),
          },
          jobs: [...jobs],
        });
      }
    }
  }

  return [...byPerson.values()].map(({ member, jobs }) => ({
    ...member,
    job: [...new Set(jobs)].join(', '),
  }));
}

/** From `/movies|shows/:id/studios`. */
export interface TraktStudio {
  name: string;
  ids: TraktIds;
}

export function normalizeStudio(raw: TraktStudio): NormalizedStudio {
  return {
    id: `trakt-studio-${raw.ids.trakt ?? raw.ids.slug}`,
    name: raw.name,
    ...(raw.ids.tmdb != null ? { tmdbId: raw.ids.tmdb } : {}),
  };
}

// ---- Seasons / episodes (detail-screen-only structure, plan 0010) ----

/** One episode inside a `/shows/:id/seasons?extended=full,episodes` payload. */
export interface TraktSeasonEpisode {
  season: number;
  number: number;
  title?: string;
  overview?: string;
  /** ISO instant (UTC) or null while unaired; absent in older payloads. */
  first_aired?: string | null;
  /** Minutes. */
  runtime?: number;
}

/** One season from `/shows/:id/seasons?extended=full,episodes`. */
export interface TraktShowSeason {
  number: number;
  title?: string;
  ids: TraktIds;
  episodes?: TraktSeasonEpisode[];
}

/**
 * Sort seasons ascending but move "Specials" (number 0) to the end — the way
 * TV apps present them, instead of Trakt's specials-first payload order.
 */
export function orderSeasons<T extends { readonly number: number }>(
  seasons: readonly T[],
): T[] {
  // .sort() on the .filter() copies, not .toSorted() — Hermes (iOS/Android JS
  // engine) doesn't implement the ES2023 change-by-copy array methods.
  return [
    ...seasons
      .filter((season) => season.number !== 0)
      .sort((a, b) => a.number - b.number),
    ...seasons
      .filter((season) => season.number === 0)
      .sort((a, b) => a.number - b.number),
  ];
}

/** "Season N" with title fall-through; "Specials" for Trakt's season 0. */
function seasonTitle(raw: TraktShowSeason): string {
  if (raw.number === 0) return 'Specials';
  // Trakt sometimes gives specials-named seasons a blank `title`; never trust
  // it for the numeric seasons — keep the canonical "Season N" label.
  return `Season ${raw.number}`;
}

export function normalizeSeason(raw: TraktShowSeason): NormalizedSeason {
  return {
    number: raw.number,
    title: seasonTitle(raw),
    episodes: orderSeasons(raw.episodes ?? []).map((episode) => ({
      number: episode.number,
      title: episode.title || `Episode ${episode.number}`,
      ...(episode.overview != null && episode.overview !== ''
        ? { overview: episode.overview }
        : {}),
      ...(episode.first_aired != null && episode.first_aired !== ''
        ? { firstAired: episode.first_aired }
        : {}),
      ...(episode.runtime != null ? { runtime: episode.runtime } : {}),
    })),
  };
}

/**
 * Per-episode watched completion for one show, from the authenticated
 * `/shows/:id/progress/watched` endpoint. Yields the `"${season}-${number}"`
 * keys that Trakt marks completed — the accordion rows match against this set
 * to render watch checkmarks without touching the flat feed contract — plus
 * the show's `next_episode` pointer (plan 0019 KTD-1), which is what Up Next
 * is computed from.
 */
export interface TraktProgressEpisode {
  number: number;
  completed: number | boolean;
}

export interface TraktProgressSeason {
  number: number;
  episodes?: TraktProgressEpisode[];
}

/**
 * `next_episode` from `/shows/:id/progress/watched?extended=full`. Unlike the
 * progress *seasons* episodes above, this one does carry its own `season`, and
 * `extended=full` adds the episode-level fields (`first_aired`, `runtime`) the
 * bare request omits. Trakt sets it to `null` once there is nothing left to
 * watch, and it points at an upcoming episode when the user is caught up on
 * everything aired — that case is exactly what the Calendar section surfaces.
 */
export interface TraktNextEpisodeRaw {
  season: number;
  number: number;
  title?: string | null;
  /** ISO instant; absent/null while Trakt has no air date for the episode. */
  first_aired?: string | null;
  runtime?: number | null;
}

export interface TraktShowProgress {
  aired?: number;
  completed?: number;
  last_watched_at?: string;
  seasons?: TraktProgressSeason[];
  next_episode?: TraktNextEpisodeRaw | null;
}

/** The show's next unwatched episode, normalized (plan 0019 U1). */
export interface TraktNextEpisode {
  season: number;
  number: number;
  title?: string;
  /**
   * ISO instant, or `null` when Trakt knows the episode but not when it airs.
   * Carried rather than dropped so the Up Next split can exclude it knowingly
   * (an unknown air date is not the same as "not aired yet").
   */
  firstAired: string | null;
  /** Minutes, when `extended=full` carried one. */
  runtime?: number;
}

export interface TraktShowProgressResult {
  /** `"${season}-${number}"` for every completed episode. */
  watchedKeys: ReadonlySet<string>;
  /** Absent when the user has nothing left to watch (Trakt sends null). */
  nextEpisode?: TraktNextEpisode;
}

export function normalizeWatchedProgress(
  raw: TraktShowProgress,
): TraktShowProgressResult {
  const watchedKeys = new Set<string>();
  for (const season of raw.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      // Trakt sends `completed` as both `0/1` (older) and `true/false` (newer).
      // Progress episodes carry no `season` field of their own — the season
      // number lives only on the enclosing season object.
      if (episode.completed === true || episode.completed === 1) {
        watchedKeys.add(`${season.number}-${episode.number}`);
      }
    }
  }

  const next = raw.next_episode;
  if (next == null) return { watchedKeys };

  return {
    watchedKeys,
    nextEpisode: {
      season: next.season,
      number: next.number,
      ...(next.title != null && next.title !== '' ? { title: next.title } : {}),
      firstAired:
        next.first_aired != null && next.first_aired !== ''
          ? next.first_aired
          : null,
      ...(next.runtime != null ? { runtime: next.runtime } : {}),
    },
  };
}

/**
 * Watched entries carry their own instant (`last_watched_at`), so unlike the
 * catalogue normalizers no external `nowIso` is needed; `plays` becomes the
 * item's progress (a movie watched twice has `currentProgress: 2`).
 */
export function normalizeWatchedMovie(raw: TraktWatchedMovie): NormalizedMediaItem {
  return {
    ...normalizeMovie(raw.movie, raw.last_watched_at),
    currentProgress: raw.plays,
  };
}

// ---- Diary history (plan 0016) ----

/** One episode inside a `/sync/history` episode row (its own ids + numbering). */
export interface TraktHistoryEpisode {
  season: number;
  number: number;
  title?: string;
  ids?: TraktIds;
}

/**
 * One row from `/sync/history?extended=full`. Each row is a single log with its
 * own unique `id`; movie rows embed `movie`, episode rows embed both `episode`
 * and `show` (the diary entry's media item is the *show*, with episode detail
 * attached — plan 0016 U1).
 */
export interface TraktHistoryItem {
  /** Unique per-log id — the diary dedup key, not the media id. */
  id: number;
  /** ISO instant. */
  watched_at: string;
  action?: string;
  type: string;
  movie?: TraktMovie;
  show?: TraktShow;
  episode?: TraktHistoryEpisode;
}

/**
 * A `/sync/history` row → one diary entry. Movie rows carry no episode detail;
 * episode rows normalize the *show* as the media item and attach the season +
 * episode number. `watched_at` is a real instant, parsed as such downstream
 * (never a bare date) so day grouping stays timezone-correct (plan 0016 R4).
 * Rows of a type we don't model (unlikely) normalize to `null` and drop out.
 */
export function normalizeHistoryItem(
  raw: TraktHistoryItem,
): NormalizedDiaryEntry | null {
  if (raw.type === 'movie' && raw.movie != null) {
    return {
      id: `trakt-${raw.id}`,
      provider: 'trakt',
      watchedAt: raw.watched_at,
      item: normalizeMovie(raw.movie, raw.watched_at),
    };
  }
  if (raw.type === 'episode' && raw.show != null && raw.episode != null) {
    return {
      id: `trakt-${raw.id}`,
      provider: 'trakt',
      watchedAt: raw.watched_at,
      item: normalizeShow(raw.show, raw.watched_at),
      episodes: [raw.episode.number],
      season: raw.episode.season,
    };
  }
  return null;
}

// ---- My calendars (plan 0030) ----

/**
 * The episode embedded in a `/calendars/*` show row. Every field is optional
 * because calendar rows are *validated*, not assumed: Trakt indexes episodes
 * whose numbering or air date it only partly knows, and one such row must cost
 * its own entry, never the whole section (plan 0030 U3).
 */
export interface TraktCalendarEpisodeRaw {
  season?: number | null;
  number?: number | null;
  title?: string | null;
  /** Repeated from the row under `extended=full`; the row's is authoritative. */
  first_aired?: string | null;
  runtime?: number | null;
}

/**
 * One row from `/calendars/my/shows/{start_date}/{days}` — episodes of shows
 * the user has watched **or watchlisted**, already minus the shows they hid
 * from their Trakt calendar (KTD-2). The air instant lives at the *row* level.
 */
export interface TraktCalendarShowRow {
  /** ISO instant (UTC) — compare through `lib/time/has-aired`, never naively. */
  first_aired?: string | null;
  episode?: TraktCalendarEpisodeRaw | null;
  show?: TraktShow | null;
}

/** One upcoming airing: the show as a normalized item + the episode airing. */
export interface TraktCalendarEpisode {
  item: NormalizedMediaItem;
  /**
   * Deliberately the same shape as the `progress/watched` pointer, so Up Next
   * reads one episode type whichever Trakt path produced it.
   */
  episode: TraktNextEpisode;
}

export function normalizeCalendarShowRow(
  raw: TraktCalendarShowRow,
  nowIso: string,
): TraktCalendarEpisode | null {
  const show = raw.show;
  const episode = raw.episode;
  if (show?.ids?.trakt == null || show.title == null || show.title === '') {
    return null;
  }

  // `typeof`, not `!= null`: a numbering Trakt sent as something other than a
  // number is as unusable as an absent one, and both must drop.
  const season = episode?.season;
  const number = episode?.number;
  if (typeof season !== 'number' || typeof number !== 'number') return null;
  // Season 0 is specials, and the calendar returns them. `normalizeWatchedShow`
  // already excludes season 0 from progress for the same reason: an OVA or recap
  // airing Wednesday is not the next thing to watch, and rendering it as
  // "S0E1" on a show the user is caught up on reads as a bug.
  if (season <= 0) return null;

  // A calendar row exists *because* it airs on a date — one without an air
  // instant can neither be bucketed into a day nor ordered, so it drops.
  const firstAired = raw.first_aired ?? episode?.first_aired;
  if (firstAired == null || firstAired === '') return null;

  const title = episode?.title;
  const runtime = episode?.runtime;
  return {
    item: normalizeShow(show, nowIso),
    episode: {
      season,
      number,
      ...(title != null && title !== '' ? { title } : {}),
      firstAired,
      ...(typeof runtime === 'number' ? { runtime } : {}),
    },
  };
}

/**
 * One row from a `/calendars/my/{movies|streaming|dvd}` response. All three
 * share this shape — only the meaning of `released` differs, which is why the
 * release kind is passed in rather than inferred from the payload.
 */
export interface TraktCalendarMovieRow {
  /** Bare `YYYY-MM-DD` — a release is a calendar day, not an instant. */
  released?: string | null;
  movie?: TraktMovie | null;
}

/** One dated film release, keyed to the `ReleaseCalendar` slot it fills. */
export interface TraktCalendarRelease {
  item: NormalizedMediaItem;
  /**
   * Which calendar produced it: `/movies` → theatrical, `/streaming` →
   * digital, `/dvd` → physical. Same union as `ReleaseCalendar`'s keys so a
   * Trakt-sourced date and a TMDB-sourced one stay interchangeable (KTD-4).
   */
  kind: keyof ReleaseCalendar;
  /** Bare `YYYY-MM-DD`, as Trakt states it. */
  date: string;
}

export function normalizeCalendarMovieRow(
  raw: TraktCalendarMovieRow,
  kind: keyof ReleaseCalendar,
  nowIso: string,
): TraktCalendarRelease | null {
  const movie = raw.movie;
  if (movie?.ids?.trakt == null || movie.title == null || movie.title === '') {
    return null;
  }

  // Bare date or nothing. An ISO instant is *not* truncated to its first ten
  // characters here: that names the UTC day, which is the wrong local day west
  // of Greenwich — exactly the bug `lib/time` exists to prevent. An unexpected
  // shape drops rather than releasing a film on the wrong day.
  const date = raw.released;
  if (date == null || !isDateOnly(date)) return null;

  return {
    item: {
      ...normalizeMovie(movie, nowIso),
      // Trakt fills exactly the one slot this calendar answers for; the other
      // two stay absent unless TMDB's catalogue read supplies them later.
      releaseCalendar: { [kind]: date },
    },
    kind,
    date,
  };
}

export function normalizeWatchedShow(raw: TraktWatchedShow): NormalizedMediaItem {
  // Specials (season 0) don't count toward progress — `aired_episodes` (the
  // denominator on the card) excludes them, so counting them here overshoots.
  const watchedEpisodes =
    raw.seasons?.reduce(
      (count, season) =>
        season.number === 0 ? count : count + season.episodes.length,
      0,
    ) ?? 0;

  return {
    id: `trakt-${raw.show.ids.trakt}`,
    title: raw.show.title,
    coverImage: imageUrl(raw.show.images?.poster),
    ...detailFields(raw.show),
    type: 'TV',
    currentProgress: watchedEpisodes,
    progressUnit: 'episode',
    ...(raw.show.aired_episodes != null
      ? { totalEpisodes: raw.show.aired_episodes }
      : {}),
    lastUpdated: raw.last_watched_at,
    externalIds: externalIdsFrom(raw.show.ids),
  };
}
