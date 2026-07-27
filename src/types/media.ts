/**
 * The normalized data contract (`plan.md` 2.2, AGENTS.md "Data Contract").
 * Every provider response (Trakt REST, AniList GraphQL, Letterboxd REST) is
 * mapped into this shape before it reaches components — components never see
 * raw provider payloads. This file is the source of truth; the snippet in
 * `plan.md` 2.2 mirrors it.
 */

// Type-only import — erased at build, so the (media ↔ providers/types) type
// cycle never becomes a runtime one. Kept because a diary entry's provider is
// part of the normalized contract, alongside the item it embeds.
import type { ProviderId } from '@/lib/providers/types';

// Extension point for future domains (e.g. 'GAME' | 'BOOK' | 'ALBUM').
// Widen this union + the provider registry (lib/providers/registry.ts) only —
// never branch on new types inline in hooks or components.
export type MediaType = 'TV' | 'MOVIE' | 'ANIME' | 'MANGA';

// What `currentProgress` counts. Future domains bring their own units
// (e.g. 'page' | 'minute' | 'listen'), so progress is never assumed to be
// an episode index.
export type ProgressUnit = 'episode' | 'chapter';

/**
 * When a film became available, by how you'd watch it — each the earliest
 * **worldwide** date TMDB knows, as a bare `YYYY-MM-DD`, absent when no region
 * has published that kind of release. Ordered as released, which is the order
 * the details timeline renders them in.
 */
export interface ReleaseCalendar {
  /** In cinemas — TMDB release types 2 (limited) and 3 (wide), earliest of the two. */
  theatrical?: string;
  /** Buy/rent at home — TMDB release type 4. */
  digital?: string;
  /** Disc — TMDB release type 5. */
  physical?: string;
}

export interface NormalizedMediaItem {
  /** Unique combined identifier: `${providerId}-${nativeId}`, e.g. `trakt-12345`. */
  id: string;
  title: string;
  coverImage: string;
  /** Wide hero/fanart image for detail views; '' when the provider has none. */
  backdropImage?: string;
  overview?: string;
  year?: number;
  /** Minutes (per entry for TV — a typical episode, not the whole run). */
  runtime?: number;
  genres?: string[];
  /** Provider community rating on a 0–10 scale. */
  rating?: number;
  type: MediaType;
  /**
   * Anime films (AniList `format: MOVIE`) are `ANIME` here but count as a
   * `MOVIE` for Trakt/Letterboxd routing (`plan.md` 1.3). This flag — not a
   * fifth MediaType — is what lets `providersForLog` fan out to all three.
   */
  isFilm?: boolean;
  /**
   * First release: a movie's theatrical release date, a show's first air date.
   * ISO instant with offset/Z, or the bare `YYYY-MM-DD` calendar date TMDB
   * sends; absent when the source carries none. Same contract as
   * `NormalizedEpisode.firstAired` — compare it through `lib/time/has-aired`
   * (a bare date parses as *local* midnight), never with a naive `new Date`.
   */
  releaseDate?: string;
  /**
   * Theatrical/digital/physical release dates for a film — what the details
   * screen's release timeline renders, and what the agenda dates an unreleased
   * film by (plan 0030). Absent for every TV/manga item. TMDB's `release_dates`
   * fills all three slots at once; Trakt's per-kind movie calendars fill
   * exactly the one slot they answer for, so a partly-populated value is
   * normal — never read an absent slot as "no such release".
   */
  releaseCalendar?: ReleaseCalendar;
  currentProgress: number;
  progressUnit: ProgressUnit;
  totalEpisodes?: number;
  /** ISO 8601 instant (with offset/Z) — never a bare date string. */
  lastUpdated: string;
  externalIds: {
    tmdb?: number;
    trakt?: number;
    anilist?: number;
    /** Letterboxd film IDs are opaque slugs, not numeric. */
    letterboxd?: string;
    /** TVDB/IMDB bridge ids — how anime maps across providers (plan 0011). */
    tvdb?: number;
    imdb?: string;
  };
}

/**
 * A cast credit on a detail view, normalized like everything else — raw
 * provider people payloads never reach components.
 */
export interface NormalizedCastMember {
  /** Unique combined identifier: `${providerId}-person-${nativeId}`. */
  id: string;
  name: string;
  /** Character name(s); '' when the provider omits it. */
  character: string;
  /** Headshot URL; '' when unavailable — render an initials fallback. */
  headshot: string;
  /**
   * TMDB person id when the origin provider carries one (Trakt does) — the
   * person route is keyed by TMDB only. Absent (AniList people) means the
   * route resolves by name search instead.
   */
  tmdbId?: number;
}

/** A crew credit — one entry per person, jobs merged across departments. */
export interface NormalizedCrewMember {
  /** Unique combined identifier: `${providerId}-person-${nativeId}`. */
  id: string;
  name: string;
  /** Job title(s), e.g. "Director" or "Editor, Producer"; '' when omitted. */
  job: string;
  /** Headshot URL; '' when unavailable — render an initials fallback. */
  headshot: string;
  /** See NormalizedCastMember.tmdbId. */
  tmdbId?: number;
}

/**
 * The person behind a cast/crew credit, backing the `/person/[id]` route.
 * TMDB is the single source of truth for people — there are no per-provider
 * person variants, so this is keyed by the TMDB id directly.
 */
export interface NormalizedPerson {
  tmdbId: number;
  name: string;
  /** Display headshot URL; '' when unavailable — render an initials fallback. */
  headshot: string;
  /** Full-resolution headshot for the zoom viewer; '' when unavailable. */
  headshotFull: string;
  biography?: string;
  /** Bare calendar date (YYYY-MM-DD) as TMDB sends it — display only. */
  birthday?: string;
  /** Bare calendar date (YYYY-MM-DD) as TMDB sends it — display only. */
  deathday?: string;
  birthplace?: string;
  /** TMDB department, e.g. "Acting" — that row leads on the person screen. */
  knownForDepartment?: string;
}

/**
 * A production company/studio backing the `/studio/[id]` route — TMDB-keyed
 * for the same single-source-of-truth reason as NormalizedPerson.
 */
export interface NormalizedCompany {
  tmdbId: number;
  name: string;
  /** Logo URL; '' when unavailable — render the 忍 placeholder. */
  logo: string;
  headquarters?: string;
  homepage?: string;
}

/** One role-grouped row of a person's previous work ("Acting", "Directing", …). */
export interface PersonCreditRow {
  role: string;
  items: NormalizedMediaItem[];
  /**
   * Per-item credit detail keyed by item id — character name(s) on the
   * Acting row, job title(s) on crew rows ("Director"). Lives beside `items`
   * rather than on NormalizedMediaItem: the role is a fact about this
   * person's credit, not about the media.
   */
  details: Record<string, string>;
}

export interface NormalizedStudio {
  /** Unique combined identifier: `${providerId}-studio-${nativeId}`. */
  id: string;
  name: string;
  /**
   * TMDB company id when the origin carries one — the studio route is keyed
   * by TMDB only. Absent (AniList studios) means name lookup instead.
   */
  tmdbId?: number;
}

/**
 * One episode within a `NormalizedSeason`. Detail-screen-only structure — these
 * never reach the unified feed (which stays the flat `NormalizedMediaItem`).
 */
export interface NormalizedEpisode {
  /** Season-relative episode number. */
  number: number;
  title: string;
  overview?: string;
  /** ISO instant with offset/Z, or absent when Trakt has no air date. */
  firstAired?: string;
  /** Minutes. */
  runtime?: number;
}

/**
 * One season of a TV show. `number: 0` is Trakt's "Specials" bucket; the
 * normalizer reorders seasons so specials render last instead of first.
 */
export interface NormalizedSeason {
  number: number;
  /** "Season N"; "Specials" for season 0. */
  title: string;
  episodes: NormalizedEpisode[];
}

/**
 * One per-log history entry (the Diary contract, plan 0016). Every provider's
 * history payload normalizes to this before it reaches the merge/grouping
 * layer — components never see raw history shapes (AGENTS.md Data Contract).
 *
 * A diary entry is a *log*, not a media item: the same film logged twice is two
 * entries. Cross-provider same-day collapse and day-header grouping are derived
 * by pure functions in `features/diary/` and never stored here.
 */
export interface NormalizedDiaryEntry {
  /**
   * Stable per-log id `${provider}-${nativeLogId}` — the dedup key that lets
   * page N+1 re-return the tail of page N (prepend-mutable histories) without
   * showing a row twice.
   */
  id: string;
  provider: ProviderId;
  /**
   * ISO 8601 instant of the log. Trakt/AniList carry a true instant; Letterboxd
   * RSS carries only a bare calendar date (`YYYY-MM-DD`), flagged by `dateOnly`
   * so grouping parses it as local midnight and orders it after instant-bearing
   * entries within the same day (plan 0016 KTD4).
   */
  watchedAt: string;
  /** True when `watchedAt` is a bare date (Letterboxd), not a full instant. */
  dateOnly?: boolean;
  /** The logged media — the *show* for an episode log, the film for a movie. */
  item: NormalizedMediaItem;
  /**
   * Episode/chapter numbers this one log covers, sorted ascending (plan 0016
   * KTD2): an AniList "watched episode 3 - 5" activity is one entry carrying
   * `[3, 4, 5]`; a movie carries none. This set is the fan-out signature two
   * cross-provider entries must share to collapse into one row.
   */
  episodes?: number[];
  /** Season number for a TV episode log (Trakt), for the "S2E5" detail line. */
  season?: number;
}

/**
 * The presentation-side collapse of same-day, same-item logs from *different*
 * providers into one row (plan 0016 KTD4). Derived by `groupDiaryEntries`,
 * never stored. Two logs from the same provider never merge (a binge day / a
 * same-day rewatch stay distinct rows).
 */
export interface MergedDiaryEntry {
  /** Row key — the highest-precedence contributor's log id. */
  id: string;
  /** Every provider that logged this item on this day, precedence-ordered. */
  providers: ProviderId[];
  /** Display item: merge-metadata precedence across contributors. */
  item: NormalizedMediaItem;
  /** Union of every contributor's episode numbers, sorted ascending. */
  episodes: number[];
  /** Season number when contributors carry one (TV). */
  season?: number;
  /** Representative instant (or date) for within-day ordering. */
  watchedAt: string;
  /** True when every contributor is date-only (Letterboxd-only merge). */
  dateOnly: boolean;
}

/** One day bucket in the diary, newest-first, under a `YYYY-MM-DD` local key. */
export interface DiaryDay {
  /** Local calendar day key `YYYY-MM-DD` — the header derives from this. */
  key: string;
  entries: MergedDiaryEntry[];
}
