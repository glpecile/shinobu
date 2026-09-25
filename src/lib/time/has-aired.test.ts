import { describe, expect, test } from 'bun:test';

import { hasAired } from './has-aired';

const NOW = new Date('2026-07-13T12:00:00.000Z');

describe('hasAired', () => {
  test('null / empty / unparseable values never count as aired', () => {
    expect(hasAired(null, NOW)).toBe(false);
    expect(hasAired(undefined, NOW)).toBe(false);
    expect(hasAired('', NOW)).toBe(false);
    expect(hasAired('not a date', NOW)).toBe(false);
  });

  test('a full ISO instant strictly after now has not aired', () => {
    expect(hasAired('2026-07-13T12:00:01.000Z', NOW)).toBe(false);
    expect(hasAired('2027-01-01T00:00:00.000Z', NOW)).toBe(false);
  });

  test('the exact air instant counts as aired (<=)', () => {
    expect(hasAired('2026-07-13T12:00:00.000Z', NOW)).toBe(true);
  });

  test('a date-only string is treated as local midnight, not UTC midnight', () => {
    // Local wall-clock `now` on either side of local midnight: UTC-midnight
    // parsing flips one of these on any host that isn't at UTC+0.
    expect(hasAired('2026-07-14', new Date(2026, 6, 14, 0, 0))).toBe(true);
    expect(hasAired('2026-07-14', new Date(2026, 6, 13, 23, 59))).toBe(false);
  });
});
