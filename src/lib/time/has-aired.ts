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
  const airInstant = parseLocalInstant(firstAired);
  if (airInstant == null) return false;
  // Instant comparison is timezone-independent — both sides are absolute
  // points in time once parsed correctly above.
  return airInstant.getTime() <= now.getTime();
}

/**
 * Whether a release date is *not known to be in the future* — the permissive
 * counterpart to `hasAired`, for gating an action rather than revealing
 * content. An absent, empty, or unparseable date returns `true`: a provider
 * that simply doesn't carry a release date is no evidence the title is
 * unreleased, and the log button must never block on missing data. (`hasAired`
 * answers `false` for the same input because *showing* an episode as available
 * is the spoiler-shaped failure; *refusing* a log is the annoying one.)
 *
 * Mirrors the unaired-episode rule in `features/log-media`: a `null` air date
 * counts as airable, only a known future one blocks. The actual comparison is
 * delegated to `hasAired` — there is exactly one date comparison here.
 */
export function hasReleased(
  releaseDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (releaseDate == null || releaseDate === '') return true;
  if (parseLocalInstant(releaseDate) == null) return true;
  return hasAired(releaseDate, now);
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