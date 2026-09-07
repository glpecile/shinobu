/**
 * The Android picker (@expo/ui → Compose Material3 DatePicker) speaks in
 * **UTC-midnight millis for a calendar day**, not local instants: it reports
 * the picked day as `Date.UTC(y, m, d)` and reads `initialSelectedDateMillis`
 * the same way. Feeding it a local instant, or reading its result as one,
 * shifts the day by one on any phone west of UTC (Sept 5 00:00Z is Sept 4
 * evening in UTC−3). Emulators default to UTC, so it never reproduces there.
 * iOS's UIDatePicker returns real local instants and needs neither.
 */

/** Local calendar day → the UTC-midnight instant the picker highlights. */
export function toPickerValue(local: Date): Date {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/**
 * Picker result → a local instant inside the picked day. Keeps the current
 * time-of-day (like the web field) so the stored ISO instant can't slide
 * across a midnight boundary when providers render it in the user's zone.
 */
export function fromPickerValue(picked: Date, now: Date = new Date()): Date {
  return new Date(
    picked.getUTCFullYear(),
    picked.getUTCMonth(),
    picked.getUTCDate(),
    now.getHours(),
    now.getMinutes(),
  );
}
