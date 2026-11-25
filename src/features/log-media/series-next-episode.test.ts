import { describe, expect, test } from 'bun:test';

import {
  firstUnairedEpisode,
  nextEpisodeFromProgress,
  nextEpisodeFromSimklEntry,
  simklAnimeEpisodeAired,
  unairedEpisodeLabel,
} from './series-next-episode';

const NO_WATCHED = new Set<string>();

describe('nextEpisodeFromProgress', () => {
  test('carries Trakt’s next episode through, aired', () => {
    expect(
      nextEpisodeFromProgress({
        watchedKeys: NO_WATCHED,
        nextEpisode: {
          season: 2,
          number: 5,
          title: 'The One With The Thing',
          firstAired: '2020-01-01T00:00:00.000Z',
        },
      }),
    ).toEqual({
      season: 2,
      number: 5,
      title: 'The One With The Thing',
      aired: true,
      firstAired: '2020-01-01T00:00:00.000Z',
      rewatch: false,
      unaired: false,
    });
  });

  test('an episode airing in the future is named but not loggable', () => {
    const next = nextEpisodeFromProgress({
      watchedKeys: NO_WATCHED,
      nextEpisode: { season: 1, number: 4, firstAired: '2099-01-01T00:00:00.000Z' },
    });
    expect(next).toEqual({
      season: 1,
      number: 4,
      aired: false,
      firstAired: '2099-01-01T00:00:00.000Z',
      rewatch: false,
      unaired: false,
    });
  });

  test('a fully watched show wraps to S1E1, flagged as a rewatch', () => {
    expect(
      nextEpisodeFromProgress({ watchedKeys: NO_WATCHED, aired: 12 }),
    ).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
      unaired: false,
    });
  });
});

describe('the zero-aired state (plan 0035 R17/R18)', () => {
  test('no next episode and nothing aired is `unaired`, never a rewatch', () => {
    expect(
      nextEpisodeFromProgress({ watchedKeys: NO_WATCHED, aired: 0 }),
    ).toEqual({
      season: 1,
      number: 1,
      aired: false,
      rewatch: false,
      unaired: true,
    });
  });

  test('an absent aired count takes the rewatch path — old caches behave as before', () => {
    const next = nextEpisodeFromProgress({ watchedKeys: NO_WATCHED });
    expect(next.rewatch).toBe(true);
    expect(next.unaired).toBe(false);
  });

  test('a named next episode with a null air date is still logable (R19)', () => {
    const next = nextEpisodeFromProgress({
      watchedKeys: NO_WATCHED,
      aired: 0,
      nextEpisode: { season: 1, number: 1, firstAired: null },
    });
    expect(next.aired).toBe(true);
    expect(next.unaired).toBe(false);
  });
});

describe('nextEpisodeFromSimklEntry', () => {
  const freshItem = { currentProgress: 0, totalEpisodes: 20 };
  const midItem = { currentProgress: 10, totalEpisodes: 20 };
  const doneItem = { currentProgress: 20, totalEpisodes: 20 };

  test('carries the watching snapshot’s pointer through, aired', () => {
    expect(
      nextEpisodeFromSimklEntry(midItem, {
        nextToWatch: {
          season: 1,
          episode: 11,
          title: 'The Night of the Hunters',
          date: '2020-01-01T00:00:00Z',
        },
      }),
    ).toEqual({
      season: 1,
      number: 11,
      title: 'The Night of the Hunters',
      aired: true,
      firstAired: '2020-01-01T00:00:00Z',
      rewatch: false,
      unaired: false,
    });
  });

  test('a future air instant is named but not loggable', () => {
    expect(
      nextEpisodeFromSimklEntry(midItem, {
        nextToWatch: { season: 1, episode: 11, date: '2099-01-01T00:00:00Z' },
      })?.aired,
    ).toBe(false);
  });

  test('a null air date stays permissive, like the Trakt path', () => {
    expect(
      nextEpisodeFromSimklEntry(midItem, {
        nextToWatch: { season: 2, episode: 1, date: null },
      })?.aired,
    ).toBe(true);
  });

  test('a TV pointer without a season number is unnameable, not season 1', () => {
    expect(
      nextEpisodeFromSimklEntry(midItem, {
        nextToWatch: { episode: 11, date: null },
      }),
    ).toBeNull();
  });

  test('an entry with nothing left wraps to S1E1 as a rewatch', () => {
    expect(
      nextEpisodeFromSimklEntry(doneItem, { notAiredEpisodes: 0 }),
    ).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
      unaired: false,
    });
  });

  test('a part-way entry with no pointer is unnameable, never a rewatch', () => {
    expect(
      nextEpisodeFromSimklEntry(midItem, { notAiredEpisodes: 0 }),
    ).toBeNull();
  });

  test('a show outside the watching list starts fresh at S1E1', () => {
    expect(nextEpisodeFromSimklEntry(freshItem, null)).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: false,
      unaired: false,
    });
  });

  test('a fresh show outside the watching list waits for its premiere', () => {
    const next = nextEpisodeFromSimklEntry(
      { ...freshItem, releaseDate: '2999-09-22' },
      null,
    );
    expect(next?.aired).toBe(false);
    expect(next?.firstAired).toBe('2999-09-22');
  });

  test('a finished show outside the watching list offers a rewatch', () => {
    expect(nextEpisodeFromSimklEntry(doneItem, null)).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
      unaired: false,
    });
  });

  test('an entry whose whole run is unaired is `unaired`, not a rewatch', () => {
    expect(
      nextEpisodeFromSimklEntry({ currentProgress: 0, totalEpisodes: 8 }, {
        notAiredEpisodes: 8,
      }),
    ).toEqual({
      season: 1,
      number: 1,
      aired: false,
      rewatch: false,
      unaired: true,
    });
  });

  test('a missing not-aired count takes the rewatch path, unchanged', () => {
    const noCount = nextEpisodeFromSimklEntry(doneItem, {});
    expect(noCount?.rewatch).toBe(true);
    expect(noCount?.unaired).toBe(false);
    const noTotal = nextEpisodeFromSimklEntry(
      { currentProgress: 3, totalEpisodes: null },
      { notAiredEpisodes: 8 },
    );
    expect(noTotal?.rewatch).toBe(true);
  });

  test('a mid-show item without an entry is unnameable', () => {
    expect(nextEpisodeFromSimklEntry(midItem, null)).toBeNull();
  });
});

describe('simklAnimeEpisodeAired', () => {
  const now = new Date(2026, 8, 12, 14, 0);

  test('an episode the user already watched aired — the rewatch wrap', () => {
    expect(simklAnimeEpisodeAired(1, { currentProgress: 10, totalEpisodes: 10 }, {})).toBe(true);
  });

  test('`total - not_aired` decides the next episode', () => {
    const item = { currentProgress: 5, totalEpisodes: 12 };
    expect(simklAnimeEpisodeAired(6, item, { notAiredEpisodes: 6 })).toBe(true);
    expect(simklAnimeEpisodeAired(6, item, { notAiredEpisodes: 7 })).toBe(false);
  });

  test('without counts only the pointer speaks, permissive on a null date', () => {
    const item = { currentProgress: 5, totalEpisodes: null };
    expect(simklAnimeEpisodeAired(6, item, { nextToWatch: { episode: 6, date: null } })).toBe(true);
    expect(
      simklAnimeEpisodeAired(
        6,
        item,
        { nextToWatch: { episode: 6, date: '2026-09-20T15:00:00+09:00' } },
        now,
      ),
    ).toBe(false);
    expect(simklAnimeEpisodeAired(6, item, {})).toBe(false);
  });
});

describe('firstUnairedEpisode', () => {
  const now = new Date(2026, 8, 12, 14, 0);
  const lanterns = [
    {
      number: 1,
      title: 'Season 1',
      episodes: [
        { number: 1, title: 'One', firstAired: '2026-08-15T01:00:00.000Z' },
        { number: 4, title: 'Four', firstAired: '2026-09-05T01:00:00.000Z' },
        { number: 5, title: 'Five', firstAired: '2026-09-15T01:00:00.000Z' },
        { number: 6, title: 'Six', firstAired: '2026-09-22T01:00:00.000Z' },
      ],
    },
  ];

  test('names the first episode still to air, with its date', () => {
    expect(firstUnairedEpisode(lanterns, now)).toEqual({
      season: 1,
      number: 5,
      firstAired: '2026-09-15T01:00:00.000Z',
    });
  });

  test('a fully aired show has none — the rewatch state survives', () => {
    expect(
      firstUnairedEpisode(
        [{ number: 1, title: 'Season 1', episodes: lanterns[0]!.episodes.slice(0, 2) }],
        now,
      ),
    ).toBeNull();
    expect(firstUnairedEpisode(undefined, now)).toBeNull();
  });

  test('specials never speak for the show’s next episode', () => {
    expect(
      firstUnairedEpisode(
        [
          { number: 0, title: 'Specials', episodes: [{ number: 1, title: 'Extra' }] },
          { number: 1, title: 'Season 1', episodes: lanterns[0]!.episodes.slice(0, 2) },
        ],
        now,
      ),
    ).toBeNull();
  });

  test('an undated episode counts as unaired, without a date to count down', () => {
    expect(
      firstUnairedEpisode(
        [{ number: 2, title: 'Season 2', episodes: [{ number: 1, title: 'Announced' }] }],
        now,
      ),
    ).toEqual({ season: 2, number: 1 });
  });
});

describe('unairedEpisodeLabel', () => {
  const now = new Date(2026, 8, 12, 14, 0);

  test('counts down in local calendar days', () => {
    expect(unairedEpisodeLabel('S1E5', '2026-09-15T01:00:00.000Z', now)).toBe(
      'S1E5 airs in 3 days',
    );
    expect(unairedEpisodeLabel('Episode 11', '2026-09-13', now)).toBe(
      'Episode 11 airs tomorrow',
    );
    expect(unairedEpisodeLabel('S1E5', '2026-09-12T23:00:00.000Z', now)).toBe(
      'S1E5 airs today',
    );
  });

  test('falls back to the plain line without a usable date', () => {
    expect(unairedEpisodeLabel('Episode 11', undefined, now)).toBe(
      "Episode 11 hasn't aired yet",
    );
    expect(unairedEpisodeLabel('Episode 11', 'not a date', now)).toBe(
      "Episode 11 hasn't aired yet",
    );
    expect(unairedEpisodeLabel('S1E5', '2026-09-01', now)).toBe(
      "S1E5 hasn't aired yet",
    );
  });
});
