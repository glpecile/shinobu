import { expect, test } from 'bun:test';

import { formatCalendarDate } from './calendar-date';

test('an option set to undefined never shares a cached formatter with its default', () => {
  expect(formatCalendarDate('2027-11-05', { weekday: 'short', year: undefined })).not.toContain('2027');
  expect(formatCalendarDate('2027-11-05', { weekday: 'short' })).toContain('2027');
});
