import { describe, expect, test } from 'bun:test';

import { filmReleaseStatus } from './release-gate';

// Local noon: a bare release date parses as local midnight, so a UTC-anchored
// "now" would flip these assertions in far-east/far-west timezones.
const NOW = new Date(2026, 6, 27, 12, 0, 0);

describe('filmReleaseStatus', () => {
  test('a film already out is released', () => {
    expect(filmReleaseStatus({ releaseDate: '2026-07-01' }, NOW)).toBe('released');
    expect(filmReleaseStatus({ releaseDate: '1999-03-31' }, NOW)).toBe('released');
    expect(
      filmReleaseStatus({ releaseDate: '2026-07-27T00:00:00.000Z' }, NOW),
    ).toBe('released');
  });

  test('a film out later is unreleased', () => {
    expect(filmReleaseStatus({ releaseDate: '2026-07-28' }, NOW)).toBe('unreleased');
    expect(filmReleaseStatus({ releaseDate: '2030-01-01' }, NOW)).toBe('unreleased');
  });

  test('a film released today counts as out', () => {
    expect(filmReleaseStatus({ releaseDate: '2026-07-27' }, NOW)).toBe('released');
  });

  test('no date and no year is unknown, so it cannot be logged', () => {
    // The reported case: an announced project with cast and crew but no
    // release date anywhere.
    expect(filmReleaseStatus({}, NOW)).toBe('unknown');
    expect(filmReleaseStatus({ releaseDate: '' }, NOW)).toBe('unknown');
    expect(filmReleaseStatus({ releaseDate: 'not a date' }, NOW)).toBe('unknown');
  });

  test('a past year is proof enough when no date survived the merge', () => {
    // A Letterboxd item (slug + title + year) with no TMDB backfill must stay
    // loggable — it is plainly out.
    expect(filmReleaseStatus({ year: 2019 }, NOW)).toBe('released');
    expect(filmReleaseStatus({ year: 2019, releaseDate: 'nonsense' }, NOW)).toBe(
      'released',
    );
  });

  test('the current year alone is not proof — it could still be ahead', () => {
    expect(filmReleaseStatus({ year: 2026 }, NOW)).toBe('unknown');
    expect(filmReleaseStatus({ year: 2027 }, NOW)).toBe('unknown');
  });

  test('a real date always wins over the year fallback', () => {
    expect(filmReleaseStatus({ year: 2019, releaseDate: '2030-01-01' }, NOW)).toBe(
      'unreleased',
    );
  });
});
