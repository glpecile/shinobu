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
  };
}
