export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

/** Bundled TMDB v4 Read Access Token, or empty when omitted. */
export function builderTmdbToken(): string {
  return process.env.EXPO_PUBLIC_TMDB_TOKEN ?? '';
}

export function resolveTmdbToken(sources: { builder: string; stored: string | null }): string {
  return sources.builder !== '' ? sources.builder : (sources.stored ?? '');
}

export type TmdbImageSize = 'w185' | 'w300' | 'w342' | 'w780' | 'w1280' | 'original';

export function tmdbImageUrl(path: string | null | undefined, size: TmdbImageSize): string {
  if (path == null || path === '') return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}
