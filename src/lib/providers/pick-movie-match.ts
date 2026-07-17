import type { NormalizedMediaItem } from '@/types/media';

/**
 * Choose which Trakt text-search result actually *is* the film we looked up
 * by title+year. Exact year first, then ±1 (festival premiere vs wide
 * release can straddle a year boundary between providers). When the target
 * year is known and nothing lands close, the answer is **no match** — the
 * top hit is just the most popular film sharing the title (Nolan's
 * "The Odyssey" (2026) must not resolve to Kubrick's "2001: A Space
 * Odyssey"), and wrong-film metadata — or worse, a log write to the wrong
 * film — is strictly worse than none
 * (docs/solutions/trakt-text-search-wrong-movie-match.md). Only a yearless
 * item falls back to the top hit.
 */
export function pickMovieMatch(
  results: readonly NormalizedMediaItem[],
  year: number | undefined,
): NormalizedMediaItem | null {
  const movies = results.filter((result) => result.type === 'MOVIE');
  if (year == null) return movies[0] ?? null;
  return (
    movies.find((movie) => movie.year === year) ??
    movies.find(
      (movie) => movie.year != null && Math.abs(movie.year - year) <= 1,
    ) ??
    null
  );
}
