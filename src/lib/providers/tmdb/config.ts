export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

/**
 * TMDB v4 Read Access Token (the long "API Read Access Token" from
 * https://www.themoviedb.org/settings/api), sent as a Bearer header.
 * Builder-supplied like the Trakt client id — EXPO_PUBLIC_* vars are inlined
 * into the bundle. Empty means the person route stays dark: person cards
 * don't navigate (details screen checks this before wiring presses).
 */
export function tmdbToken(): string {
  return process.env.EXPO_PUBLIC_TMDB_TOKEN ?? '';
}

export type TmdbImageSize = 'w185' | 'w300' | 'w342' | 'w780' | 'w1280' | 'original';

/** Full image URL for a TMDB image path; '' when the path is missing. */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbImageSize,
): string {
  if (path == null || path === '') return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}
