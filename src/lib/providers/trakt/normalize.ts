import type {
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedDiaryEntry,
  NormalizedMediaItem,
  NormalizedSeason,
  NormalizedStudio,
} from '@/types/media';

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
 * `/shows/:id/progress/watched` endpoint. Returns the `"${season}-${number}"`
 * keys that Trakt marks completed — the accordion rows match against this set
 * to render watch checkmarks without touching the flat feed contract.
 */
export interface TraktProgressEpisode {
  number: number;
  completed: number | boolean;
}

export interface TraktProgressSeason {
  number: number;
  episodes?: TraktProgressEpisode[];
}

export interface TraktShowProgress {
  aired?: number;
  completed?: number;
  last_watched_at?: string;
  seasons?: TraktProgressSeason[];
}

export function normalizeWatchedProgress(
  raw: TraktShowProgress,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const season of raw.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      // Trakt sends `completed` as both `0/1` (older) and `true/false` (newer).
      // Progress episodes carry no `season` field of their own — the season
      // number lives only on the enclosing season object.
      if (episode.completed === true || episode.completed === 1) {
        keys.add(`${season.number}-${episode.number}`);
      }
    }
  }
  return keys;
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
