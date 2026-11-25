/**
 * Format bare dates in UTC to preserve the stated calendar day. Use has-aired for comparisons
 * against local time.
 */
export function formatCalendarDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return calendarFormatter(options).format(new Date(Date.UTC(year, month - 1, day)));
}

// Hermes builds a formatter on every `toLocaleDateString`; episode rows call this per row.
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

function calendarFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // `year: undefined` drops a default, so it must not share `{}`'s key.
  const key = JSON.stringify(options, (_, value: unknown) => (value === undefined ? null : value));
  let formatter = calendarFormatters.get(key);
  if (formatter == null) {
    formatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...options,
      timeZone: 'UTC',
    });
    calendarFormatters.set(key, formatter);
  }
  return formatter;
}
