/**
 * TMDB sends bare calendar dates (`YYYY-MM-DD`). Parsing one through
 * `new Date(string)` lands at UTC midnight, which `toLocaleDateString` would
 * render a day early west of Greenwich — so the date is formatted in UTC
 * explicitly, and "Feb 27, 2024" means Feb 27 everywhere.
 *
 * Display only. This is deliberately *not* how a date is compared against
 * "now": `lib/time/has-aired` parses a bare date as **local** midnight, which
 * is the correct ordering rule (AGENTS.md "Up Next & Timezones"). Formatting
 * and comparison answer different questions, so they parse differently on
 * purpose — never swap one for the other.
 *
 * Unparseable input is returned verbatim: a provider that sends something
 * unexpected should surface as an odd-looking date, not a crash or an empty
 * slot.
 */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
