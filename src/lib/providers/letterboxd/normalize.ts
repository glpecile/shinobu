import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_POSTER_CDN_URL } from './config';
import type { LetterboxdWatchlistFilm } from './watchlist';

/**
 * Constructed poster CDN URL — the pattern RSS poster URLs follow, verified
 * to also work from watchlist-page data: the numeric film id split into
 * per-digit path segments, then `{id}-{slug}-…-crop.jpg`. The CDN validates
 * filename: some films use alternate slugs or unrelated upload paths. The
 * shared Image wrapper recovers failures from film-page JSON-LD instead
 * (docs/solutions/letterboxd-constructed-poster-403.md).
 */
export function posterUrl(
  filmId: number,
  slug: string,
  cacheBustingKey?: string,
): string {
  const digits = String(filmId).split('').join('/');
  const suffix = cacheBustingKey != null ? `?v=${cacheBustingKey}` : '';
  return `${LETTERBOXD_POSTER_CDN_URL}/resized/film-poster/${digits}/${filmId}-${slug}-0-600-0-900-crop.jpg${suffix}`;
}

/**
 * Watchlist film → the shared contract. The watchlist page exposes no
 * external ids (no tmdb — only the diary RSS carries those), so these items
 * can't cross-route to Trakt/AniList; `externalIds.letterboxd` alone is
 * enough for the Letterboxd queue write. `fetchedAt` is injected so
 * normalization stays deterministic under test.
 */
export function normalizeWatchlistFilm(
  film: LetterboxdWatchlistFilm,
  fetchedAt: string,
): NormalizedMediaItem {
  return {
    id: `letterboxd-${film.slug}`,
    title: film.title,
    coverImage:
      film.filmId != null
        ? posterUrl(film.filmId, film.slug, film.cacheBustingKey)
        : '',
    ...(film.year != null ? { year: film.year } : {}),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: fetchedAt,
    externalIds: { letterboxd: film.slug },
  };
}
