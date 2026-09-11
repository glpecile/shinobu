import { formatCalendarDate } from '@/lib/time/calendar-date';
import { isDateOnly } from '@/lib/time/has-aired';
import type { NormalizedEpisode } from '@/types/media';

/**
 * "S2E10" — the pointer every episode surface leads with, in the app's one
 * episode-code format. It used to be spelled three ways ("S2 E10" here,
 * "S2E10" on the log button, "E10" in the season sheets) for the same episode
 * on screens one tap apart.
 */
export function episodeCode(season: number, number: number): string {
  return `S${season}E${number}`;
}

/**
 * The air date, formatted for the kind of value the source carried: a bare
 * TMDB date renders as that calendar day everywhere (never shifted through
 * UTC), a Trakt instant renders in the viewer's local zone.
 */
export function formatAirDate(firstAired: string): string {
  if (isDateOnly(firstAired)) return formatCalendarDate(firstAired);
  const date = new Date(firstAired);
  if (Number.isNaN(date.getTime())) return firstAired;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Sep 3, 2026 · 28 min" from whichever fields exist; '' when neither. */
export function episodeMetaLine(episode: Pick<NormalizedEpisode, 'firstAired' | 'runtime'>): string {
  return [
    episode.firstAired != null ? formatAirDate(episode.firstAired) : null,
    episode.runtime != null ? `${episode.runtime} min` : null,
  ]
    .filter((part) => part != null)
    .join(' · ');
}
