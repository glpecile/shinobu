/**
 * The normalized data contract (`plan.md` 2.2, AGENTS.md "Data Contract").
 * Every provider response (Trakt REST, AniList GraphQL, Letterboxd REST) is
 * mapped into this shape before it reaches components — components never see
 * raw provider payloads. This file is the source of truth; the snippet in
 * `plan.md` 2.2 mirrors it.
 */

// Extension point for future domains (e.g. 'GAME' | 'BOOK' | 'ALBUM').
// Widen this union + the provider registry (lib/providers/registry.ts) only —
// never branch on new types inline in hooks or components.
export type MediaType = 'TV' | 'MOVIE' | 'ANIME' | 'MANGA';

// What `currentProgress` counts. Future domains bring their own units
// (e.g. 'page' | 'minute' | 'listen'), so progress is never assumed to be
// an episode index.
export type ProgressUnit = 'episode' | 'chapter';

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
