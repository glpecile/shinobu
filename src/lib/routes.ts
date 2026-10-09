import type {
  AnimeFormatFilter,
  AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import type { ProviderId } from '@/lib/providers/types';
import { PROVIDERS } from '@/lib/providers/registry';
import type { MediaType } from '@/types/media';

/** Only the first hyphen separates the provider from its opaque item ID. */
function mediaPath(id: string): string {
  const separator = id.indexOf('-');
  if (separator < 1) throw new Error(`Invalid media item ID: ${id}`);
  return `${encodeURIComponent(id.slice(0, separator))}/${encodeURIComponent(id.slice(separator + 1))}`;
}

/** Restore cache identity at the route boundary, not throughout the data layer. */
export function mediaItemId(provider: unknown, id: unknown): string | null {
  if (typeof provider !== 'string' || typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (!Object.hasOwn(PROVIDERS, provider) && provider !== 'tmdb' && provider !== 'imdb') return null;
  return `${provider}-${id}`;
}

/**
 * Centralized route definitions. Use this instead of hardcoding path strings so
 * Expo Router route changes only require updates in one place.
 */
export const routes = {
  home: '/',
  settings: '/settings',
  search: '/search',
  diary: '/diary',
  details: (id: string, mediaType?: MediaType) => {
    let suffix = '';
    switch (id.slice(0, id.indexOf('-'))) {
      case 'trakt':
        if (mediaType === 'MOVIE' || mediaType === 'TV') suffix = `/${mediaType === 'MOVIE' ? 'movie' : 'tv'}`;
        break;
      case 'anilist':
        if (mediaType === 'MANGA') suffix = '/manga';
        break;
    }
    return `/details/${mediaPath(id)}${suffix}` as const;
  },
  /**
   * One episode of the show `id` (the show's own item id, resolved the same
   * way `/details` resolves it), with season and number in the resource path.
   */
  episode: (id: string, season: number, number: number) =>
    `/episode/${mediaPath(id)}/${season}/${number}` as const,
  /**
   * An anime episode by its *entry-relative* number, no season: anime logs
   * carry no tracker season, so the route places the number on the trackers'
   * layout itself (ani.zip + TMDB) instead of every list row doing it.
   */
  animeEpisode: (id: string, number: number) =>
    `/episode/${mediaPath(id)}/${number}` as const,
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
  letterboxdLists: (kind: 'created' | 'liked') => `/lists/letterboxd?kind=${kind}` as const,
  letterboxdList: (owner: string, slug: string) =>
    `/lists/letterboxd/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}` as const,
  serializdLists: (kind: 'created' | 'liked') => `/lists/serializd?kind=${kind}` as const,
  serializdList: (id: string) => `/lists/serializd/${encodeURIComponent(id)}` as const,
  /**
   * The AniList seasons explorer behind the home feed's seasonal row. The
   * window lives in the URL, like `/watchlist`'s filter, so a season is
   * shareable and the picker is `setParams`, not a push.
   */
  animeSeasons: ({ season, year }: AnimeSeasonWindow, format: AnimeFormatFilter = 'ALL') =>
    `/anime-seasons?season=${season}&year=${year}&format=${format}` as const,
  /** Keyed by TMDB person id — the single source of truth for people. */
  person: (tmdbId: number) => `/person/tmdb/${tmdbId}` as const,
  /**
   * An AniList staff member by their own id. No name search, so a manga author
   * never lands on a namesake TMDB person.
   */
  anilistPerson: (anilistId: number) => `/person/anilist/${anilistId}` as const,
  /** For credits without a TMDB or AniList person id: resolve by name. */
  personLookup: (name: string) =>
    `/person/lookup/${encodeURIComponent(name)}` as const,
  /** Keyed by TMDB company id — same single-source rule as /person. */
  studio: (tmdbId: number) => `/studio/tmdb/${tmdbId}` as const,
  /** For studios without a TMDB id (AniList's): resolve by name. */
  studioLookup: (name: string) =>
    `/studio/lookup/${encodeURIComponent(name)}` as const,
} as const;
