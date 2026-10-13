import { describe, expect, test } from 'bun:test';

import {
  filmReleaseStatus,
  hasStartedAiring,
  needsReleaseEnrichment,
  preAiringDisplay,
  seriesPremiere,
  unreleasedFilmLabel,
  watchlistCtaIsPrimary,
} from './release-gate';

// Local noon: a bare release date parses as local midnight, so a UTC-anchored
// "now" would flip these assertions in far-east/far-west timezones.
const NOW = new Date(2026, 6, 27, 12, 0, 0);

describe('unreleasedFilmLabel', () => {
  test.each([
    ['2026-08-19', 'In theaters in 23 days'],
    ['2026-07-28', 'In theaters tomorrow'],
    [new Date(2026, 6, 27, 23).toISOString(), 'In theaters today'],
    [undefined, 'Not yet released'],
    ['2026-07-26', 'Not yet released'],
  ])('%s → %s', (releaseDate, label) => {
    expect(unreleasedFilmLabel(releaseDate, NOW)).toBe(label);
  });
});

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
  test('a film with no date at all hides the button — "unknown" is not "released"', () => {
    expect(watchlistCtaIsPrimary({ type: 'MOVIE' }, NOW)).toBe(true);
  });

  test('an unreleased film keeps its disabled log CTA beside the watchlist one', () => {
    // Anime parity (owner override 2026-10-12): "Episode 1 airs in 8 days"
    // stays visible and disabled rather than vanishing — movies do the same
    // with a release countdown.
    expect(
      watchlistCtaIsPrimary({ type: 'MOVIE', releaseDate: '2026-12-25' }, NOW),
    ).toBe(false);
    expect(
      watchlistCtaIsPrimary({ type: 'ANIME', isFilm: true, releaseDate: '2026-12-25' }, NOW),
    ).toBe(false);
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

  test('a released film keeps both controls', () => {
    expect(
      watchlistCtaIsPrimary({ type: 'MOVIE', releaseDate: '1997-01-01' }, NOW),
    ).toBe(false);
    expect(watchlistCtaIsPrimary({ type: 'MOVIE', year: 2019 }, NOW)).toBe(false);
  });
});

describe('needsReleaseEnrichment', () => {
  test('only `unknown` film rows need the details read', () => {
    // The reported Simkl case: library rows carry year only.
    expect(needsReleaseEnrichment({ type: 'MOVIE', year: 2026 }, NOW)).toBe(true);
    expect(needsReleaseEnrichment({ type: 'MOVIE' }, NOW)).toBe(true);
    expect(
      needsReleaseEnrichment({ type: 'ANIME', isFilm: true, year: 2026 }, NOW),
    ).toBe(true);
  });

  test('judgeable rows and series never pay for the fetch', () => {
    // Resolved by the read above: TMDB backfills 2026-08-28, so the row
    // stops needing enrichment and the gate sees `released`.
    expect(
      needsReleaseEnrichment({ type: 'MOVIE', releaseDate: '2026-08-28' }, NOW),
    ).toBe(false);
    expect(
      needsReleaseEnrichment({ type: 'MOVIE', releaseDate: '2026-12-25' }, NOW),
    ).toBe(false);
    expect(needsReleaseEnrichment({ type: 'MOVIE', year: 2019 }, NOW)).toBe(false);
    expect(needsReleaseEnrichment({ type: 'TV' }, NOW)).toBe(false);
    expect(needsReleaseEnrichment({ type: 'ANIME', year: 2026 }, NOW)).toBe(false);
  });
});

describe('hasStartedAiring', () => {
  const NOW_2026 = new Date(2026, 8, 12, 12, 0, 0);

  test('an aired episode proves the season is running', () => {
    expect(
      hasStartedAiring({ year: 2026 }, [
        { firstAired: '2026-09-01T14:00:00.000Z' },
        {},
      ], NOW_2026),
    ).toBe(true);
  });

  test('an entirely undated announced season has not started', () => {
    const undated = Array.from({ length: 10 }, () => ({}));
    expect(hasStartedAiring({ year: 2026 }, undated, NOW_2026)).toBe(false);
    expect(
      hasStartedAiring({ year: 2026, releaseDate: '2026-12-01' }, undated, NOW_2026),
    ).toBe(false);
  });

  test('the back catalogue stays loggable without a single air date', () => {
    expect(hasStartedAiring({ year: 2005 }, [{}, {}], NOW_2026)).toBe(true);
    expect(
      hasStartedAiring({ releaseDate: '2026-04-05' }, [{}], NOW_2026),
    ).toBe(true);
  });
});

describe('preAiringDisplay', () => {
  test('films and manga keep production behavior', () => {
    expect(preAiringDisplay({ type: 'MOVIE' }, [], 0, NOW)).toBe('progress');
    expect(preAiringDisplay({ type: 'ANIME', isFilm: true }, [], 0, NOW)).toBe('progress');
    expect(preAiringDisplay({ type: 'MANGA' }, [], 0, NOW)).toBe('progress');
  });

  test('a log is proof something aired, even with no date anywhere', () => {
    expect(preAiringDisplay({ type: 'TV' }, [{}, {}], 1, NOW)).toBe('progress');
  });

  test('released series render normally', () => {
    expect(
      preAiringDisplay({ type: 'TV', releaseDate: '2026-07-01' }, [{}], 0, NOW),
    ).toBe('progress');
    expect(preAiringDisplay({ type: 'ANIME', year: 2019 }, [{}, {}], 0, NOW)).toBe('progress');
  });

  test('a dated future premiere counts down, even while episodes load', () => {
    expect(
      preAiringDisplay({ type: 'TV', releaseDate: '2026-08-19' }, undefined, 0, NOW),
    ).toBe('countdown');
    expect(
      preAiringDisplay({ type: 'TV', releaseDate: '2026-08-19' }, [{}], 0, NOW),
    ).toBe('countdown');
  });

  test('loading stays permissive when nothing dates the series', () => {
    // A dateless airing show keeps its tile until its episodes prove otherwise.
    expect(preAiringDisplay({ type: 'TV' }, undefined, 0, NOW)).toBe('progress');
    expect(preAiringDisplay({ type: 'ANIME', year: 2026 }, undefined, 0, NOW)).toBe('progress');
  });

  test('an anime premiere comes from episode 1, not the item', () => {
    // AniList items carry no releaseDate, only a year.
    expect(
      preAiringDisplay(
        { type: 'ANIME', year: 2026 },
        [{ firstAired: '2026-08-19' }, {}],
        0,
        NOW,
      ),
    ).toBe('countdown');
  });

  test('announced with no date anywhere collapses', () => {
    expect(preAiringDisplay({ type: 'ANIME', year: 2026 }, [{}, {}], 0, NOW)).toBe('hidden');
    expect(preAiringDisplay({ type: 'TV' }, [], 0, NOW)).toBe('hidden');
  });

  test('an aired episode flips the countdown off', () => {
    expect(
      preAiringDisplay(
        { type: 'TV', releaseDate: '2026-08-19' },
        [{ firstAired: '2026-07-20' }],
        0,
        NOW,
      ),
    ).toBe('progress');
  });
});

describe('seriesPremiere', () => {
  test('the series date wins; otherwise the earliest dated episode', () => {
    expect(seriesPremiere({ releaseDate: '2026-08-19' }, [{ firstAired: '2026-08-01' }])).toBe(
      '2026-08-19',
    );
    expect(
      seriesPremiere({}, [{ firstAired: '2026-08-19' }, { firstAired: '2026-08-01' }, {}]),
    ).toBe('2026-08-01');
    expect(seriesPremiere({}, [{}, {}])).toBeUndefined();
  });
});
