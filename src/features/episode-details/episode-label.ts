import { formatCalendarDate } from '@/lib/time/calendar-date';
import { isDateOnly } from '@/lib/time/has-aired';

export function episodeCode(season: number, number: number): string {
  return `S${season}E${number}`;
}

/** Bare `YYYY-MM-DD` dates format as that calendar day (no UTC shift); ISO instants format in the local timezone. */
export function formatAirDate(firstAired: string): string {
  if (isDateOnly(firstAired)) return formatCalendarDate(firstAired, { weekday: 'short' });
  const date = new Date(firstAired);
  if (Number.isNaN(date.getTime())) return firstAired;
  return airInstantFormatter.format(date);
}

const airInstantFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
