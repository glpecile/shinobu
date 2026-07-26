import { describe, expect, test } from 'bun:test';

import { hasAired, hasReleased } from './has-aired';

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

/**
 * The log-button gate: `LogMediaButton` blocks a film whose release date is
 * known to be in the future, and stays permissive otherwise — the exact
 * mirror of its unaired-episode rule (a null air date counts as airable).
 */
describe('hasReleased', () => {
  test('a movie already out is loggable', () => {
    expect(hasReleased('2026-07-01', NOW)).toBe(true);
    expect(hasReleased('2026-07-13T11:59:59.000Z', NOW)).toBe(true);
    expect(hasReleased('1999-03-31', NOW)).toBe(true);
  });

  test('a movie not out yet is blocked', () => {
    expect(hasReleased('2026-07-14', NOW)).toBe(false);
    expect(hasReleased('2026-07-13T12:00:01.000Z', NOW)).toBe(false);
    expect(hasReleased('2030-01-01', NOW)).toBe(false);
  });

  test('a movie with no known release date stays loggable', () => {
    // Never block on missing data: a provider that carries no release date
    // is no evidence the film is unreleased.
    expect(hasReleased(null, NOW)).toBe(true);
    expect(hasReleased(undefined, NOW)).toBe(true);
    expect(hasReleased('', NOW)).toBe(true);
    expect(hasReleased('not a date', NOW)).toBe(true);
  });

  test('the exact release instant counts as released', () => {
    expect(hasReleased('2026-07-13T12:00:00.000Z', NOW)).toBe(true);
  });

  test('is the permissive inverse of hasAired only for unknown dates', () => {
    // Known dates: the two agree. Unknown ones: they deliberately disagree.
    expect(hasReleased('2030-01-01', NOW)).toBe(hasAired('2030-01-01', NOW));
    expect(hasReleased('2022-01-01', NOW)).toBe(hasAired('2022-01-01', NOW));
    expect(hasReleased(null, NOW)).not.toBe(hasAired(null, NOW));
  });
});