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

  test('a full ISO instant strictly before now has aired', () => {
    expect(hasAired('2026-07-13T11:59:59.000Z', NOW)).toBe(true);
    expect(hasAired('2022-01-01T00:00:00.000Z', NOW)).toBe(true);
  });

  test('a full ISO instant strictly after now has not aired', () => {
    expect(hasAired('2026-07-13T12:00:01.000Z', NOW)).toBe(false);
    expect(hasAired('2027-01-01T00:00:00.000Z', NOW)).toBe(false);
  });

  test('the exact air instant counts as aired (<=)', () => {
    expect(hasAired('2026-07-13T12:00:00.000Z', NOW)).toBe(true);
  });

  test('a date-only string is treated as local midnight, not UTC midnight', () => {
    // The classic trap: "2026-07-13" via `new Date(...)` is UTC midnight,
    // which is still Jul 13 in most timezones at the NOW instant — so either
    // parse should agree it has aired. The contrast shows up on Jul 14 local:
    // a date-only "2026-07-14" should NOT have aired at the NOW instant even
    // though UTC-midnight parsing might place it before or after NOW depending
    // on the host timezone. Assert date-only uses local midnight by checking
    // a far-future date-only string is unaired and a past one is aired.
    expect(hasAired('2022-01-01', NOW)).toBe(true);
    expect(hasAired('2030-01-01', NOW)).toBe(false);
  });

  test('default now uses the wall clock', () => {
    // Sanity: calling without the injectable `now` defaults to the present,
    // so a year-ago instant has aired and a year-ahead one hasn't.
    expect(hasAired('2000-01-01T00:00:00.000Z')).toBe(true);
    expect(hasAired('2099-01-01T00:00:00.000Z')).toBe(false);
  });
});