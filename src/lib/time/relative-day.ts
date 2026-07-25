import { isDateOnly, parseLocalInstant } from '@/lib/time/has-aired';

/**
 * Relative-day labels for upcoming releases (plan 0019 KTD-10) — "Today",
 * "Tomorrow", "In 3 days". The diary's `formatDayHeader` is past-facing and
 * stays untouched; what these two share is `parseLocalInstant`, so an air
 * instant is bucketed by the *user's* calendar day, never the origin
 * timezone's (AGENTS.md "Up Next & Timezones").
 *
 * Everything here works in local calendar days: an instant 40 minutes from now
 * that crosses local midnight is "Tomorrow", not "In 1 day"-worth of elapsed
 * hours. `now` is injectable so day rollover is testable and so callers can
 * pass a render-time clock instead of freezing one at fetch time (KTD-5).
 */

const MS_PER_DAY = 24 * 60 * 60_000;

/** Local midnight opening the calendar day `date` falls in. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from `now`'s local day to `instant`'s: 0 today, 1
 * tomorrow, -1 yesterday. Null when the value doesn't parse. Rounded, not
 * truncated, so a DST-shifted 23- or 25-hour day still counts as one day.
 */
export function localDayOffset(
  instant: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (instant == null || instant === '') return null;
  const parsed = parseLocalInstant(instant);
  if (parsed == null) return null;
  const diff =
    startOfLocalDay(parsed).getTime() - startOfLocalDay(now).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/**
 * "Today" / "Tomorrow" / "In N days" (and the past-facing mirror, so a stale
 * pointer never renders as a nonsense future). Null when unparseable — callers
 * render no badge rather than a placeholder.
 */
export function formatRelativeDay(
  instant: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const offset = localDayOffset(instant, now);
  if (offset == null) return null;
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  return offset > 0 ? `In ${offset} days` : `${-offset} days ago`;
}

/**
 * The clock time an episode airs, in the *user's* timezone — "21:30". A
 * relative day alone ("Today") can't answer "have I missed it?", which is
 * exactly the question on the day something airs.
 *
 * 24-hour on every platform and locale, for the same reason the weekday names
 * below are hardcoded: identical output everywhere, and a two-digit "21:30"
 * keeps the badge a fixed width where "9:30 PM" would not. Built from the
 * local-time getters rather than `Intl`, which buys nothing once the clock is
 * fixed and can be absent from a slim Hermes build.
 *
 * Null when the value is unparseable *or* carries no time of day: a date-only
 * provider field parses to local midnight, and rendering that would assert a
 * 00:00 airing nobody stated.
 */
export function formatLocalTime(
  instant: string | null | undefined,
): string | null {
  if (instant == null || instant === '' || isDateOnly(instant)) return null;
  const parsed = parseLocalInstant(instant);
  if (parsed == null) return null;
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Hardcoded rather than Intl-formatted, for the same reason the diary hardcodes
// its month names: identical output on every platform and locale.
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Full local weekday name ("Saturday") — agenda day headers. */
export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()] ?? '';
}

/** Three-letter local weekday ("Sat") — the week strip's day cells. */
export function shortWeekdayName(date: Date): string {
  return weekdayName(date).slice(0, 3);
}

/**
 * Day heading for a grouped list: "Today"/"Tomorrow" stay relative (they're
 * what the user is actually orienting by), anything further out names its
 * weekday, so a bucket header never reads as a countdown ("In 5 days") that
 * silently ages while the app is open.
 */
export function formatDayHeading(offset: number, date: Date): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return weekdayName(date);
}

/** The local day `offset` days after `now`, at local midnight. */
export function localDayAt(offset: number, now: Date = new Date()): Date {
  const start = startOfLocalDay(now);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
}
