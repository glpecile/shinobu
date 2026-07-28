import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * `'unknown'` is its own outcome, not a flavour of `'unreleased'` — the button
 * says *why* it's disabled, and "we don't know when this comes out" is a
 * different sentence from "it isn't out yet".
 */
export type FilmReleaseStatus = 'released' | 'unreleased' | 'unknown';

/**
 * Whether a film can be logged as watched (owner decision, 2026-07-27:
 * an undated film — an announced project with no release date anywhere, e.g.
 * a TMDB entry with cast but no `release_date` — must not be loggable).
 *
 * This **reverses** the earlier permissive rule (`hasReleased`, plan 0014-era),
 * which let a missing date through so a provider that simply carried none never
 * blocked a legitimate log. Films get the strict treatment because a released
 * film's date is a fact every source has; episodes keep the permissive rule
 * (`log-media-button`'s `firstAired == null → aired`) because an episode inside
 * an already-airing season routinely has no individual air date.
 *
 * The `year` fallback is what keeps the strict rule honest: a Letterboxd item
 * (slug + title + year) carries no release date at all until a TMDB catalogue
 * read backfills one, and with no TMDB token that read never happens. A year
 * already behind us is still proof the film came out, so those stay loggable —
 * only a film with *no* date and *no* past year is refused, which is exactly
 * the unannounced-project case.
 *
 * `now` is injectable for tests; callers let it default.
 */
export function filmReleaseStatus(
  item: Pick<NormalizedMediaItem, 'releaseDate' | 'year'>,
  now: Date = new Date(),
): FilmReleaseStatus {
  const date = item.releaseDate;
  // Parsed, not just present: an unparseable date is no more evidence of a
  // release than an absent one, so it falls through to the year.
  if (date != null && date !== '' && parseLocalInstant(date) != null) {
    return hasAired(date, now) ? 'released' : 'unreleased';
  }
  if (item.year != null && item.year < now.getFullYear()) return 'released';
  return 'unknown';
}

/**
 * Placement only, and film-like only (plan 0031 R11): should the want-to-watch
 * CTA be the *primary* control on this item, with `LogMediaButton` not rendered
 * at all?
 *
 * Exported as one predicate — never re-derived at a call site — because the
 * film-like guard is the whole safety of it. `filmReleaseStatus` reads only
 * `releaseDate`/`year`, so an airing series with neither answers `'unknown'`;
 * consulted unguarded it would suppress the log button on exactly the shows
 * people watch weekly and delete episode logging from them. The guard is the
 * same one `log-media-button.tsx` uses for its own release check.
 *
 * This is never a gate on the watchlist verb itself — R2: released, unreleased
 * and unknown are all valid watchlist targets.
 */
export function watchlistCtaIsPrimary(
  item: Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'releaseDate' | 'year'>,
  now: Date = new Date(),
): boolean {
  const isFilmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  if (!isFilmLike) return false;
  return filmReleaseStatus(item, now) !== 'released';
}
