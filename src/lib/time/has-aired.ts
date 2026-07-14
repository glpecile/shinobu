/**
 * Whether a media release has actually aired in the user's local timezone
 * (AGENTS.md "Up Next & Timezones," todos/006). Provider air-date/time fields
 * — Trakt `first_aired`, AniList `airingSchedule` — must be treated as instants,
 * not bare date strings: comparing calendar dates naively across a timezone
 * boundary either spoils an unaired episode (showing it as available) or hides
 * an aired one.
 *
 * A full ISO instant (Trakt's format) parses to a fixed point in time and
 * compares identically in any timezone. A date-only string is the trap: under
 * the JS `Date` spec `new Date("2022-01-01")` becomes *UTC* midnight, which is
 * the origin-timezone bug. We instead treat it as midnight in the user's local
 * timezone, so "2022-01-01" means "aired by the start of Jan 1 where the user
 * is," not where the show originates.
 *
 * `now` is injectable for deterministic tests; production callers let it
 * default to the current wall clock.
 */
export function hasAired(
  firstAired: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (firstAired == null || firstAired === '') return false;
  const airInstant = parseAirInstant(firstAired);
  if (airInstant == null) return false;
  // Instant comparison is timezone-independent — both sides are absolute
  // points in time once parsed correctly above.
  return airInstant.getTime() <= now.getTime();
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a provider air-date field into an absolute instant. Full ISO instants
 * (with offset/Z) parse via the `Date` constructor; bare date-only strings are
 * rebuilt as local midnight so they don't silently shift to UTC.
 */
function parseAirInstant(value: string): Date | null {
  if (DATE_ONLY.test(value)) {
    const parts = value.split('-').map(Number);
    const [year, month, day] = parts;
    if (year == null || month == null || day == null) return null;
    const local = new Date(year, month - 1, day);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
}