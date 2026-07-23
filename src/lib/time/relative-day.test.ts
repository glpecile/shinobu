import { describe, expect, test } from 'bun:test';

import {
  formatDayHeading,
  formatRelativeDay,
  localDayAt,
  localDayOffset,
  shortWeekdayName,
  weekdayName,
} from './relative-day';

/**
 * Every case fixes `now` and builds instants with local-time constructors, so
 * the suite asserts *calendar-day* behavior in whatever timezone it runs in —
 * the same property Up Next depends on (todos/006).
 */
function localInstant(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

const NOW = new Date(2026, 6, 23, 14, 30); // Thu 2026-07-23, 14:30 local

describe('localDayOffset', () => {
  test('later today is 0, even hours ahead', () => {
    expect(localDayOffset(localInstant(2026, 7, 23, 23, 45), NOW)).toBe(0);
  });

  test('earlier today is 0, not -1', () => {
    expect(localDayOffset(localInstant(2026, 7, 23, 0, 5), NOW)).toBe(0);
  });

  test('an instant just past local midnight is 1 day out, not 0', () => {
    // 9h35m later in elapsed time, but the next calendar day — the off-by-one
    // a naive "hours / 24" would get wrong.
    expect(localDayOffset(localInstant(2026, 7, 24, 0, 5), NOW)).toBe(1);
  });

  test('counts whole calendar days forward and backward', () => {
    expect(localDayOffset(localInstant(2026, 7, 29, 3, 0), NOW)).toBe(6);
    expect(localDayOffset(localInstant(2026, 7, 30, 3, 0), NOW)).toBe(7);
    expect(localDayOffset(localInstant(2026, 7, 22, 23, 0), NOW)).toBe(-1);
  });

  test('a date-only string is read as local midnight, not UTC', () => {
    expect(localDayOffset('2026-07-23', NOW)).toBe(0);
    expect(localDayOffset('2026-07-24', NOW)).toBe(1);
  });

  test('null / empty / unparseable values yield null', () => {
    expect(localDayOffset(null, NOW)).toBeNull();
    expect(localDayOffset('', NOW)).toBeNull();
    expect(localDayOffset('not a date', NOW)).toBeNull();
  });
});

describe('formatRelativeDay', () => {
  test('later today → Today', () => {
    expect(formatRelativeDay(localInstant(2026, 7, 23, 21, 0), NOW)).toBe('Today');
  });

  test('an instant crossing local midnight → Tomorrow (not "In 1 day")', () => {
    expect(formatRelativeDay(localInstant(2026, 7, 24, 0, 30), NOW)).toBe(
      'Tomorrow',
    );
  });

  test('six days out → In 6 days (the window maximum)', () => {
    expect(formatRelativeDay(localInstant(2026, 7, 29, 12, 0), NOW)).toBe(
      'In 6 days',
    );
  });

  test('past instants read as past, never as a future countdown', () => {
    expect(formatRelativeDay(localInstant(2026, 7, 22, 12, 0), NOW)).toBe(
      'Yesterday',
    );
    expect(formatRelativeDay(localInstant(2026, 7, 20, 12, 0), NOW)).toBe(
      '3 days ago',
    );
  });

  test('unparseable input renders no label', () => {
    expect(formatRelativeDay(undefined, NOW)).toBeNull();
  });
});

describe('day headings and weekday names', () => {
  test('the first two days stay relative, the rest name their weekday', () => {
    expect(formatDayHeading(0, localDayAt(0, NOW))).toBe('Today');
    expect(formatDayHeading(1, localDayAt(1, NOW))).toBe('Tomorrow');
    expect(formatDayHeading(2, localDayAt(2, NOW))).toBe('Saturday');
  });

  test('localDayAt walks local calendar days from midnight', () => {
    const day = localDayAt(3, NOW);
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(6);
    expect(day.getDate()).toBe(26);
    expect(day.getHours()).toBe(0);
  });

  test('weekday names are locale-independent', () => {
    expect(weekdayName(new Date(2026, 6, 23))).toBe('Thursday');
    expect(shortWeekdayName(new Date(2026, 6, 23))).toBe('Thu');
  });
});
