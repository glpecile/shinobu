/**
 * Centralized route definitions. Use this instead of hardcoding path strings so
 * Expo Router route changes only require updates in one place.
 */
export const routes = {
  home: '/',
  connect: '/connect',
  search: '/search',
  diary: '/diary',
  details: (id: string) => `/details/${id}` as const,
  /**
   * The cross-provider watchlist grid — the merged row's "View all" target. No
   * provider suffix: it merges every connected provider's watchlist (plan 0031
   * R24).
   */
  watchlist: '/watchlist',
  /**
   * Letterboxd's own films-only grid, and the target of its own feed row. Kept
   * alongside `/watchlist` rather than redirected into it (owner, 2026-07-28):
   * the merged grid answers a different question, and this URL had already
   * shipped on web.
   */
  letterboxdWatchlist: '/watchlist/letterboxd',
  /** Keyed by TMDB person id — the single source of truth for people. */
  person: (tmdbId: number) => `/person/${tmdbId}` as const,
  /** For credits without a TMDB person id (AniList people): resolve by name. */
  personLookup: (name: string) =>
    `/person/lookup?name=${encodeURIComponent(name)}` as const,
  /** Keyed by TMDB company id — same single-source rule as /person. */
  studio: (tmdbId: number) => `/studio/${tmdbId}` as const,
  /** For studios without a TMDB id (AniList's): resolve by name. */
  studioLookup: (name: string) =>
    `/studio/lookup?name=${encodeURIComponent(name)}` as const,
} as const;
