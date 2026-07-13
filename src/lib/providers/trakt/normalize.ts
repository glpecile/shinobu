import type {
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedMediaItem,
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
    externalIds: {
      ...(raw.ids.trakt != null ? { trakt: raw.ids.trakt } : {}),
      ...(raw.ids.tmdb != null ? { tmdb: raw.ids.tmdb } : {}),
    },
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
    externalIds: {
      ...(raw.ids.trakt != null ? { trakt: raw.ids.trakt } : {}),
      ...(raw.ids.tmdb != null ? { tmdb: raw.ids.tmdb } : {}),
    },
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

export function normalizeWatchedShow(raw: TraktWatchedShow): NormalizedMediaItem {
  const watchedEpisodes =
    raw.seasons?.reduce((count, season) => count + season.episodes.length, 0) ?? 0;

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
    externalIds: {
      ...(raw.show.ids.trakt != null ? { trakt: raw.show.ids.trakt } : {}),
      ...(raw.show.ids.tmdb != null ? { tmdb: raw.show.ids.tmdb } : {}),
    },
  };
}
