import type { ProviderId } from '@/lib/providers/types';

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
   * The cross-provider watchlist — the only watchlist surface. No provider
   * suffix: it merges every connected provider's watchlist (plan 0031 R24).
   * `/watchlist/letterboxd` was deleted 2026-08-01 (owner): a second,
   * single-provider screen was a whole duplicate surface where the merged one
   * plus a `?provider=` filter answers the same question.
   *
   * `provider` narrows the grid to one source; omitted means "all".
   */
  watchlist: (provider?: ProviderId) =>
    provider == null ? '/watchlist' : (`/watchlist?provider=${provider}` as const),
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
