import type { NormalizedMediaItem } from '@/types/media';

/**
 * Case- and diacritic-insensitive title key. Punctuation and separators
 * collapse to single spaces so "WALL·E" and "Wall-E" compare equal, while
 * genuinely different titles ("The Odyssey" vs "2001: A Space Odyssey") stay
 * apart.
 */
function titleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Choose which text-search result actually *is* the film we looked up by
 * title+year. Confidence beats tolerance, in tiers:
 *
 * 1. exact year — and inside that tier an exact title beats a partial one, so
 *    "Labyrinth" (2025) never loses to "Labyrinth of Cinema" (2025);
 * 2. ±1 year, but only when the window holds exactly one plausible film
 *    (festival premiere vs wide release can straddle a year boundary between
 *    providers — two candidates either side of the target is a guess, not a
 *    match);
 * 3. otherwise **no match**.
 *
 * The top hit is just the most popular film sharing the title (Nolan's
 * "The Odyssey" (2026) must not resolve to Kubrick's "2001: A Space
 * Odyssey"), and wrong-film metadata — or worse, a log write to the wrong
 * film — is strictly worse than none
 * (docs/solutions/trakt-text-search-wrong-movie-match.md). `null` means
 * "skip the merge", never "take the first result"; only a yearless item
 * falls back to the top hit.
 *
 * `title` is optional so callers without one (or with a query that isn't the
 * item's own title) keep pure year gating.
 */
export function pickMovieMatch(
  results: readonly NormalizedMediaItem[],
  year: number | undefined,
  title?: string,
): NormalizedMediaItem | null {
  const movies = results.filter((result) => result.type === 'MOVIE');
  if (year == null) return movies[0] ?? null;

  const wanted = title == null || title === '' ? null : titleKey(title);
  const titleMatches = (movie: NormalizedMediaItem) =>
    wanted == null || titleKey(movie.title) === wanted;

  const exactYear = movies.filter((movie) => movie.year === year);
  if (exactYear.length > 0) {
    return exactYear.find(titleMatches) ?? exactYear[0] ?? null;
  }

  const nearby = movies.filter(
    (movie) => movie.year != null && Math.abs(movie.year - year) <= 1,
  );
  const exactTitled = nearby.filter(titleMatches);
  const candidates = exactTitled.length > 0 ? exactTitled : nearby;
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/**
 * The AniList counterpart, for the anime-film discovery fallback (plan 0024
 * KTD3). Stricter than `pickMovieMatch` in one way and looser in another,
 * both deliberate:
 *
 * - **Exact year only, no ±1 window.** This search only runs when ani.zip
 *   already missed, so there's no corroborating id — a near-year guess would
 *   attach a wrong AniList id to a log write.
 * - **The top exact-year hit is acceptable** when no title matches exactly.
 *   AniList sorts by `SEARCH_MATCH` (title relevance), not popularity, so
 *   "first" here isn't the trap that motivated `pickMovieMatch` — and an
 *   anime film's AniList title is routinely the romaji/native one while the
 *   query carries TMDB's English title.
 *
 * Films only (`isFilm`), because the AniList query already narrows to
 * `format: MOVIE` and a TV entry must never satisfy a film lookup.
 */
export function pickAnimeFilmMatch(
  results: readonly NormalizedMediaItem[],
  year: number | undefined,
  title: string,
): NormalizedMediaItem | null {
  if (year == null) return null;
  const films = results.filter(
    (result) => result.isFilm === true && result.year === year,
  );
  const wanted = titleKey(title);
  return (
    films.find((film) => titleKey(film.title) === wanted) ?? films[0] ?? null
  );
}
