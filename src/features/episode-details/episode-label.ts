import { formatCalendarDate } from '@/lib/time/calendar-date';
import { isDateOnly } from '@/lib/time/has-aired';
import type { NormalizedEpisode } from '@/types/media';

/** "S2 E10" — the pointer every episode surface leads with. */
export function episodeCode(season: number, number: number): string {
  return `S${season} E${number}`;
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
