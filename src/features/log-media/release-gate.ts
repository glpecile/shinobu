import { hasAired, parseLocalInstant } from '@/lib/time/has-aired';
import { localDayOffset } from '@/lib/time/relative-day';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

export type FilmReleaseStatus = 'released' | 'unreleased' | 'unknown';

export function unreleasedFilmLabel(
  releaseDate: string | null | undefined,
  now: Date = new Date(),
): string {
  const offset = localDayOffset(releaseDate, now);
  if (offset == null || offset < 0) return 'Not yet released';
  if (offset > 1) return `In theaters in ${offset} days`;
  return `In theaters ${offset === 0 ? 'today' : 'tomorrow'}`;
}

function isFilmLike(item: Pick<NormalizedMediaItem, 'type' | 'isFilm'>): boolean {
  return item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
}

export function filmReleaseStatus(
  item: Pick<NormalizedMediaItem, 'releaseDate' | 'year'>,
  now: Date = new Date(),
): FilmReleaseStatus {
  const date = item.releaseDate;
  if (date != null && date !== '' && parseLocalInstant(date) != null) {
    return hasAired(date, now) ? 'released' : 'unreleased';
  }
  if (item.year != null && item.year < now.getFullYear()) return 'released';
  return 'unknown';
}

export function watchlistCtaIsPrimary(
  item: Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'releaseDate' | 'year'>,
  now: Date = new Date(),
): boolean {
  if (!isFilmLike(item)) return false;
  return filmReleaseStatus(item, now) === 'unknown';
}

export function needsReleaseEnrichment(
  item: Pick<NormalizedMediaItem, 'type' | 'isFilm' | 'releaseDate' | 'year'>,
  now: Date = new Date(),
): boolean {
  if (!isFilmLike(item)) return false;
  return filmReleaseStatus(item, now) === 'unknown';
}

/** AniList lists undated episodes for both announced and back-catalogue shows (docs/solutions/anilist-undated-episodes-arent-proof-of-airing.md). */
export function hasStartedAiring(
  item: Pick<NormalizedMediaItem, 'releaseDate' | 'year'>,
  episodes: readonly Pick<NormalizedEpisode, 'firstAired'>[],
  now: Date = new Date(),
): boolean {
  if (episodes.some((episode) => hasAired(episode.firstAired, now))) return true;
  return filmReleaseStatus(item, now) === 'released';
}

export type PreAiringDisplay = 'progress' | 'countdown' | 'hidden';

/** Falls back to earliest episode air date because AniList items carry no releaseDate. */
export function seriesPremiere(
  item: Pick<NormalizedMediaItem, 'releaseDate'>,
  episodes: readonly Pick<NormalizedEpisode, 'firstAired'>[],
): string | undefined {
  if (item.releaseDate != null && item.releaseDate !== '') return item.releaseDate;
  let earliest: string | undefined;
  for (const episode of episodes) {
    const date = episode.firstAired;
    if (date == null || date === '') continue;
    if (earliest == null || date < earliest) earliest = date;
  }
  return earliest;
}

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
