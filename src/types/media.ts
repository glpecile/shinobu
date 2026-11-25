import type { Provider, ProviderId } from '@/lib/providers/types';

export type MediaType = 'TV' | 'MOVIE' | 'ANIME' | 'MANGA' | 'BOOK';

export type ProgressUnit = 'episode' | 'chapter' | 'page';

export type ReadingEvent = 'started' | 'progressed' | 'finished';

/** Earliest worldwide TMDB release dates as bare `YYYY-MM-DD`; absent when unpublished. */
export interface ReleaseCalendar {
  /** In cinemas — TMDB release types 2 (limited) and 3 (wide), earliest of the two. */
  theatrical?: string;
  /** Buy/rent at home — TMDB release type 4. */
  digital?: string;
  /** Disc — TMDB release type 5. */
  physical?: string;
}

export type RatingSource =
  | 'tmdb'
  | typeof Provider.Simkl
  | 'imdb'
  | 'mal'
  | typeof Provider.AniList
  | typeof Provider.Letterboxd
  | typeof Provider.Hardcover
  | 'rottenTomatoes'
  | 'metacritic';

/** Community score kept on the source's native scale, never rescaled. */
export interface NormalizedRating {
  source: RatingSource;
  value: number;
  /** `%` for Rotten Tomatoes' Tomatometer and AniList's average score. */
  scale: 10 | 5 | 100 | '%';
  votes?: number;
  rank?: number;
  /** The date a Wikidata score was recorded (`P585`), a bare `YYYY-MM-DD`. */
  asOf?: string;
  /** The title's page id on a non-provider source, e.g. `m/inception` on Rotten Tomatoes. */
  pageId?: string;
}

export interface NormalizedMediaItem {
  /** Unique combined identifier: `${providerId}-${nativeId}`, e.g. `trakt-12345`. */
  id: string;
  title: string;
  /** Alternate titles (TMDB maps `original_title`/`original_name` to `native`); entries may repeat `title`. */
  titles?: { romaji?: string; english?: string; native?: string };
  titleAliases?: string[];
  coverImage: string;
  backdropImage?: string;
  overview?: string;
  year?: number;
  /** Minutes: whole film for MOVIE/anime films; typical episode for series. Not total/remaining series time; absent for manga. */
  runtime?: number;
  genres?: string[];
  ratings?: NormalizedRating[];
  type: MediaType;
  /** Display-only TMDB TV relationship for a whole-entry Letterboxd film log. */
  tmdbTvVariant?: number;
  seriesEnded?: boolean;
  /** True for anime films (AniList `format: MOVIE`): `type` stays `ANIME`, while routing also targets movie providers. */
  isFilm?: boolean;
  /** ISO instant with offset/Z or bare `YYYY-MM-DD` (TMDB). Compare via `lib/time/has-aired` (bare dates parse as local midnight), never `new Date`. */
  releaseDate?: string;
  /** Partial values are normal (Trakt per-kind calendars populate one slot at a time); never read an absent slot as "no such release". */
  releaseCalendar?: ReleaseCalendar;
  currentProgress: number;
  progressUnit: ProgressUnit;
  totalEpisodes?: number;
  /** Volume number of the matched `externalIds.anilist` entry for a bridged Hardcover book. */
  anilistVolume?: number;
  readingCredits?: { people: string[]; format?: string; volumes?: number; series?: string };
  /** Display-only grouping of a Hardcover book under its AniList entry; logs must not read it. */
  bridgedAniList?: { id: number; title: string };
  /** ISO 8601 instant (with offset/Z) — never a bare date string. */
  lastUpdated: string;
  externalIds: {
    tmdb?: number;
    trakt?: number;
    anilist?: number;
    letterboxd?: string;
    tvdb?: number;
    imdb?: string;
    /** Simkl keys anime by MAL id. */
    mal?: number;
    simkl?: number;
    hardcover?: number;
  };
}

export interface NormalizedCastMember {
  /** Unique combined identifier: `${providerId}-person-${nativeId}`. */
  id: string;
  name: string;
  character: string;
  headshot: string;
  tmdbId?: number;
  anilistId?: number;
}

/** One entry per person, with jobs merged across departments. */
export interface NormalizedCrewMember {
  /** Unique combined identifier: `${providerId}-person-${nativeId}`. */
  id: string;
  name: string;
  job: string;
  headshot: string;
  tmdbId?: number;
  anilistId?: number;
  hardcoverId?: number;
}

export interface NormalizedCharacter {
  /** Unique combined identifier: `${providerId}-character-${nativeId}`. */
  id: string;
  name: string;
  role: string;
  image: string;
}

export interface NormalizedPerson {
  tmdbId?: number;
  anilistId?: number;
  hardcoverId?: number;
  hardcoverSlug?: string;
  name: string;
  headshot: string;
  headshotFull: string;
  biography?: string;
  biographyMarkdown?: string;
  /** Bare calendar date (YYYY-MM-DD) as TMDB sends it — display only. */
  birthday?: string;
  /** Bare calendar date (YYYY-MM-DD) as TMDB sends it — display only. */
  deathday?: string;
  birthplace?: string;
  knownForDepartment?: string;
}

export interface NormalizedCompany {
  tmdbId: number;
  name: string;
  logo: string;
  headquarters?: string;
  homepage?: string;
}

export interface PersonCreditRow {
  role: string;
  items: NormalizedMediaItem[];
  /** Credit detail keyed by `item.id` (includes year prefix). */
  details: Record<string, string>;
  /** Credit role keyed by `item.id`, without the year prefix `details` carries. */
  roles: Record<string, string>;
}

export interface NormalizedStudio {
  /** Unique combined identifier: `${providerId}-studio-${nativeId}`. */
  id: string;
  name: string;
  tmdbId?: number;
  anilistId?: number;
  logo?: string;
}

export interface NormalizedEpisode {
  /** Season-relative episode number. */
  number: number;
  title: string;
  overview?: string;
  /** ISO instant with offset/Z (Trakt) or bare `YYYY-MM-DD` (TMDB). Compare via `lib/time/has-aired.ts`. */
  firstAired?: string;
  /** Minutes. */
  runtime?: number;
}

/** `number: 0` is Specials, ordered last by the normalizer. */
export interface NormalizedSeason {
  number: number;
  title: string;
  episodes: NormalizedEpisode[];
}

export interface NormalizedDiaryEntry {
  /** Stable per-log id `${provider}-${nativeLogId}`. */
  id: string;
  provider: ProviderId;
  /** ISO 8601 instant, or bare `YYYY-MM-DD` for Letterboxd RSS (flagged by `dateOnly`, parsed as local midnight). */
  watchedAt: string;
  dateOnly?: boolean;
  liked?: boolean;
  item: NormalizedMediaItem;
  /** Episode/chapter numbers covered by this log, sorted ascending (AniList ranges expand into one array). */
  episodes?: number[];
  season?: number;
  readingEvent?: ReadingEvent;
  pages?: { from: number; to: number };
  percent?: { from: number; to: number };
}

export interface MergedDiaryEntry {
  id: string;
  providers: ProviderId[];
  item: NormalizedMediaItem;
  /** Every contributor's `item.id`. */
  sourceIds: string[];
  episodes: number[];
  season?: number;
  watchedAt: string;
  dateOnly: boolean;
  liked?: boolean;
  readingEvent?: ReadingEvent;
  pages?: NormalizedDiaryEntry['pages'];
  percent?: NormalizedDiaryEntry['percent'];
}

export interface DiaryDay {
  /** Local calendar day `YYYY-MM-DD`. */
  key: string;
  entries: MergedDiaryEntry[];
}
