import { describe, expect, test } from 'bun:test';

import {
  filmReleaseStatus,
  hasStartedAiring,
  watchlistCtaIsPrimary,
} from './release-gate';

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

describe('watchlistCtaIsPrimary (plan 0031 R11 — placement only)', () => {
  test('an unreleased film promotes the CTA and drops the log button', () => {
    expect(
      watchlistCtaIsPrimary(
        { type: 'MOVIE', releaseDate: '2030-01-01', year: 2030 },
        NOW,
      ),
    ).toBe(true);
  });

  test('a film with no date at all counts too — "unknown" is not "released"', () => {
    expect(watchlistCtaIsPrimary({ type: 'MOVIE' }, NOW)).toBe(true);
  });

  test('an anime film is film-like; an anime series is not', () => {
    expect(
      watchlistCtaIsPrimary({ type: 'ANIME', isFilm: true, year: 2030 }, NOW),
    ).toBe(true);
    expect(watchlistCtaIsPrimary({ type: 'ANIME', isFilm: false }, NOW)).toBe(false);
  });

  test('an airing series with no release date still keeps its log button', () => {
    // The whole reason this is one exported predicate: unguarded,
    // `filmReleaseStatus` answers "unknown" here and would delete episode
    // logging from exactly the shows people watch weekly.
    expect(filmReleaseStatus({}, NOW)).toBe('unknown');
    expect(watchlistCtaIsPrimary({ type: 'TV' }, NOW)).toBe(false);
  });

  test('MANGA never consults the release gate', () => {
    expect(watchlistCtaIsPrimary({ type: 'MANGA' }, NOW)).toBe(false);
  });

  test('a released film keeps both controls', () => {
    expect(
      watchlistCtaIsPrimary({ type: 'MOVIE', releaseDate: '1997-01-01' }, NOW),
    ).toBe(false);
    expect(watchlistCtaIsPrimary({ type: 'MOVIE', year: 2019 }, NOW)).toBe(false);
  });
});

describe('hasStartedAiring', () => {
  const NOW_2026 = new Date(2026, 8, 12, 12, 0, 0);

  test('an aired episode proves the season is running', () => {
    // The gap rule's home: episode 7 has no date yet, but 1–6 aired.
    expect(
      hasStartedAiring({ year: 2026 }, [
        { firstAired: '2026-09-01T14:00:00.000Z' },
        {},
      ], NOW_2026),
    ).toBe(true);
  });

  test('an entirely undated announced season has not started', () => {
    // The reported case: AniList lists 10 episodes for Cyberpunk:
    // Edgerunners 2 and dates none of them, and the CTA read "Log episode 1"
    // over an accordion marking every episode Unaired.
    const undated = Array.from({ length: 10 }, () => ({}));
    expect(hasStartedAiring({ year: 2026 }, undated, NOW_2026)).toBe(false);
    expect(
      hasStartedAiring({ year: 2026, releaseDate: '2026-12-01' }, undated, NOW_2026),
    ).toBe(false);
  });

  test('the back catalogue stays loggable without a single air date', () => {
    // AniList retains no schedule for old series, so nothing is dated; the
    // show's own year is what says it came out.
    expect(hasStartedAiring({ year: 2005 }, [{}, {}], NOW_2026)).toBe(true);
    expect(
      hasStartedAiring({ releaseDate: '2026-04-05' }, [{}], NOW_2026),
    ).toBe(true);
  });

  test('no episodes at all falls back to the show', () => {
    expect(hasStartedAiring({ year: 2026 }, [], NOW_2026)).toBe(false);
    expect(hasStartedAiring({ year: 1998 }, [], NOW_2026)).toBe(true);
  });
});
