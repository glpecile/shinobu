/**
 * Compare ISO air instants with their offsets. Treat date-only airings as midnight in the
 * user's timezone.
 */
export function hasAired(
  firstAired: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (firstAired == null || firstAired === '') return false;
  const airInstant = parseLocalInstant(firstAired);
  if (airInstant == null) return false;
  // Instant comparison is timezone-independent — both sides are absolute
  // points in time once parsed correctly above.
  return airInstant.getTime() <= now.getTime();
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a provider date field carries a calendar day but no time of day.
 * Anything *displaying* an air time has to ask: the local-midnight parse below
 * is the right ordering key, but rendering it would claim a 12:00 AM airing
 * the provider never stated.
 */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

/**
 * Parses a provider date field into an absolute instant. Full ISO instants
 * (with offset/Z) parse via the `Date` constructor; bare date-only strings are
 * rebuilt as **local midnight** so they don't silently shift to UTC (the JS
 * `Date` spec parses `"2022-01-01"` as UTC midnight, the origin-timezone bug).
 *
 * Centralized here so callers that treat a date-only value as an ordering key —
 * Up Next's `hasAired` and the diary merge's date-only Letterboxd entries
 * (plan 0016 KTD4) — share one parse instead of re-implementing it.
 */
export function parseLocalInstant(value: string): Date | null {
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