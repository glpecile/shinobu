import { describe, expect, test } from 'bun:test';

import { placeInLayout, type SeasonLayout } from './season-layout';

/**
 * Every layout below is a real one, probed against both Trakt and TMDB on
 * 2026-07-27 — the two agreed on all six shows sampled. Evidence:
 * `docs/solutions/anizip-tvdb-seasons-vs-tracker-seasons.md`.
 */

describe('placeInLayout', () => {
  test('keeps the TVDB pair when the destination really has that season', () => {
    // Mushoku Tensei: both trackers split it the way TVDB does.
    const layout: SeasonLayout = [
      { season: 0, episodeCount: 3 },
      { season: 1, episodeCount: 23 },
      { season: 2, episodeCount: 24 },
      { season: 3, episodeCount: 5 },
    ];

    expect(placeInLayout(layout, { season: 2, number: 13, absolute: 38 })).toEqual({
      season: 2,
      number: 13,
    });
  });

  test('falls to the absolute number when the destination has no such season', () => {
    // The reported bug: 100 Girlfriends S3 E4 against a single 28-episode season.
    expect(
      placeInLayout([{ season: 1, episodeCount: 28 }], {
        season: 3,
        number: 4,
        absolute: 28,
      }),
    ).toEqual({ season: 1, number: 28 });
  });

  test('also falls through when the season exists but is too short', () => {
    // TVDB counts one 20-episode season 1; the tracker splits the same run at
    // 12. The named season is real but can't hold episode 20, so the absolute
    // number decides — and lands in season 2.
    expect(
      placeInLayout(
        [
          { season: 1, episodeCount: 12 },
          { season: 2, episodeCount: 24 },
        ],
        { season: 1, number: 20, absolute: 20 },
      ),
    ).toEqual({ season: 2, number: 8 });
  });

  test('specials never absorb absolute numbering', () => {
    // Solo Leveling S2: S0 holds one special; episode 13 absolute is S01E13,
    // not S01E12.
    expect(
      placeInLayout(
        [
          { season: 0, episodeCount: 1 },
          { season: 1, episodeCount: 25 },
        ],
        { season: 2, number: 1, absolute: 13 },
      ),
    ).toEqual({ season: 1, number: 13 });
  });

  test('an absolute number spanning seasons lands in the right one', () => {
    expect(
      placeInLayout(
        [
          { season: 1, episodeCount: 12 },
          { season: 2, episodeCount: 12 },
          { season: 3, episodeCount: 12 },
        ],
        { season: 9, number: 1, absolute: 25 },
      ),
    ).toEqual({ season: 3, number: 1 });
  });

  test('a row past the end of the show has nowhere to go', () => {
    expect(
      placeInLayout([{ season: 1, episodeCount: 12 }], {
        season: 2,
        number: 1,
        absolute: 40,
      }),
    ).toBeNull();
  });

  test('without an absolute number an unknown season is unplaceable', () => {
    expect(
      placeInLayout([{ season: 1, episodeCount: 24 }], { season: 3, number: 4 }),
    ).toBeNull();
  });

  test('a missing or specials-only layout answers nothing', () => {
    expect(placeInLayout(null, { season: 1, number: 1, absolute: 1 })).toBeNull();
    expect(placeInLayout([], { season: 1, number: 1, absolute: 1 })).toBeNull();
    expect(
      placeInLayout([{ season: 0, episodeCount: 4 }], {
        season: 1,
        number: 1,
        absolute: 1,
      }),
    ).toBeNull();
  });
});
