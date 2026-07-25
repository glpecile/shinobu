export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

/**
 * The builder's TMDB v4 Read Access Token (the long "API Read Access Token"
 * from https://www.themoviedb.org/settings/api), sent as a Bearer header.
 * EXPO_PUBLIC_* vars are inlined into the bundle, so this is whatever the
 * build shipped — empty in a build that ships none.
 */
export function builderTmdbToken(): string {
  return process.env.EXPO_PUBLIC_TMDB_TOKEN ?? '';
}

/**
 * Which token TMDB requests actually use. The builder's wins outright: a build
 * that ships a token is the maintainer's decision, and a stored value must
 * never quietly override it (plan 0024 R13). Otherwise the user's own token —
 * entered on the Connect screen — stands in. Empty means no TMDB at all: the
 * detail screens take their provider paths and the person/studio routes stay
 * dark (`state/session/tmdb-token.ts` is where the live values come from).
 *
 * Pure and injected rather than reading storage here, so this module stays
 * RN-free — provider tests import it transitively through `tmdb/api.ts`.
 */
export function resolveTmdbToken(sources: {
  builder: string;
  stored: string | null;
}): string {
  return sources.builder !== '' ? sources.builder : (sources.stored ?? '');
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
