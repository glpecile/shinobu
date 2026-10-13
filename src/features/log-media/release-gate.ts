import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { localDayOffset } from '@/lib/time/relative-day';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

/**
 * `'unknown'` is its own outcome, not a flavour of `'unreleased'` — the button
 * says *why* it's disabled, and "we don't know when this comes out" is a
 * different sentence from "it isn't out yet".
 */
export type FilmReleaseStatus = 'released' | 'unreleased' | 'unknown';

/** Disabled film CTA, counting down in the user's local calendar days. */
export function unreleasedFilmLabel(
  releaseDate: string | null | undefined,
  now: Date = new Date(),
): string {
  const offset = localDayOffset(releaseDate, now);
  if (offset == null || offset < 0) return 'Not yet released';
  if (offset > 1) return `In theaters in ${offset} days`;
  return `In theaters ${offset === 0 ? 'today' : 'tomorrow'}`;
}

/** Movies and anime films — the rows a release date can gate. Series never. */
function isFilmLike(item: Pick<NormalizedMediaItem, 'type' | 'isFilm'>): boolean {
  return item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
}
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
 * Only `'unknown'` hides the button: a film with no date anywhere can't name
 * its reason, so the watchlist CTA stands alone. An *unreleased* film keeps
 * its (disabled) log CTA beside it — "In theaters in 23 days", the anime shape
 * ("Episode 1 airs in 8 days") — rather than a silent absence.
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
  if (!isFilmLike(item)) return false;
  return filmReleaseStatus(item, now) === 'unknown';
}

/**
 * Film-like rows the logging gate can't judge yet: `filmReleaseStatus`
 * answers `'unknown'` for them, which hides the log button — even when the
 * film is out and the row's provider simply never sends dates (Simkl library
 * rows carry year only). The card-actions sheet reads these through the same
 * TMDB-backed details query as the details screen before deciding, so the two
 * agree in every configuration. Rows the gate already judges (`released`,
 * `unreleased`) never pay for the fetch.
 *
 * Film-like only, for the same reason as `watchlistCtaIsPrimary`'s guard: an
 * airing series is dateless by nature and must never pay for a fetch it
 * doesn't need.
 *
 * `now` is injectable for tests; callers let it default.
 */
export function needsReleaseEnrichment(
  item: Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'releaseDate' | 'year'>,
  now: Date = new Date(),
): boolean {
  if (!isFilmLike(item)) return false;
  return filmReleaseStatus(item, now) === 'unknown';
}

/**
 * Has this show started airing? Evidence that an episode AniList lists
 * without a date is a catalogue gap rather than an announced season: an aired
 * episode, or the show's own release date/year — which is what keeps the back
 * catalogue, whose episodes are never dated, loggable
 * (docs/solutions/anilist-undated-episodes-arent-proof-of-airing.md).
 */
export function hasStartedAiring(
  item: Pick<NormalizedMediaItem, 'releaseDate' | 'year'>,
  episodes: readonly Pick<NormalizedEpisode, 'firstAired'>[],
  now: Date = new Date(),
): boolean {
  if (episodes.some((episode) => hasAired(episode.firstAired, now))) return true;
  return filmReleaseStatus(item, now) === 'released';
}

/**
 * What the details screen renders for a series' progress/seasons block.
 * `'progress'` is production as usual; `'countdown'` swaps the 0/total tile
 * for a premiere countdown with seasons hidden; `'hidden'` collapses both.
 */
export type PreAiringDisplay = 'progress' | 'countdown' | 'hidden';

/**
 * The premiere a countdown tile counts to: the series' own first-air date,
 * falling back to its earliest dated episode. The fallback is what makes this
 * work for anime — an AniList item carries no `releaseDate` (only a year), so
 * episode 1's air instant is the only premiere date that exists.
 */
export function seriesPremiere(
  item: Pick<NormalizedMediaItem, 'releaseDate'>,
  episodes: readonly Pick<NormalizedEpisode, 'firstAired'>[],
): string | undefined {
  if (item.releaseDate != null && item.releaseDate !== '') return item.releaseDate;
  let earliest: string | undefined;
  for (const episode of episodes) {
    const date = episode.firstAired;
    if (date == null || date === '') continue;
    // ISO instants and bare dates both sort lexicographically.
    if (earliest == null || date < earliest) earliest = date;
  }
  return earliest;
}

/**
 * The D treatment (variant playground, PR #236): before anything airs, the
 * progress tile becomes a premiere countdown and seasons with nothing aired
 * stay hidden; with no date anywhere both collapse.
 *
 * Series only — films keep their rule (unlogged progress already hidden, the
 * release timeline owns its dates) and manga is untouched. A log forces
 * `'progress'`: the log gates refuse unaired episodes, so logged progress is
 * proof something aired even when every date is missing. `episodes` undefined
 * is still loading, and loading stays permissive like the episode rule
 * (`firstAired == null → aired`): a dateless airing show keeps its tile until
 * its episodes prove otherwise — only a dated future premiere counts down
 * from first paint, since nothing can have aired before it.
 *
 * `now` is injectable for tests; callers let it default.
 */
export function preAiringDisplay(
  item: Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'releaseDate' | 'year'>,
  episodes: readonly Pick<NormalizedEpisode, 'firstAired'>[] | undefined,
  logged: number,
  now: Date = new Date(),
): PreAiringDisplay {
  if (item.type !== 'TV' && !(item.type === 'ANIME' && item.isFilm !== true)) {
    return 'progress';
  }
  if (logged > 0) return 'progress';
  if (episodes !== undefined && hasStartedAiring(item, episodes, now)) return 'progress';
  const status = filmReleaseStatus(item, now);
  if (status === 'released') return 'progress';
  if (status === 'unreleased') return 'countdown';
  if (episodes === undefined) return 'progress';
  const premiere = seriesPremiere(item, episodes);
  return premiere != null && localDayOffset(premiere, now) != null ? 'countdown' : 'hidden';
}
