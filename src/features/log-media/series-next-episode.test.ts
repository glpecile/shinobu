import { describe, expect, test } from 'bun:test';

import {
  nextEpisodeFromProgress,
  nextEpisodeFromSimklEntry,
  seriesEpisodeLabel,
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
      rewatch: false,
    });
  });

  test('an episode airing in the future is named but not loggable', () => {
    const next = nextEpisodeFromProgress({
      watchedKeys: NO_WATCHED,
      nextEpisode: { season: 1, number: 4, firstAired: '2099-01-01T00:00:00.000Z' },
    });
    // Named so the button can say *which* episode is waiting, not just "wait".
    expect(next).toEqual({ season: 1, number: 4, aired: false, rewatch: false });
  });

  test('an unknown air date stays permissive', () => {
    // Same rule as the anime path: a catalogue gap must never block a log the
    // user is entitled to make.
    expect(
      nextEpisodeFromProgress({
        watchedKeys: NO_WATCHED,
        nextEpisode: { season: 3, number: 1, firstAired: null },
      }).aired,
    ).toBe(true);
  });

  test('a fully watched show wraps to S1E1, flagged as a rewatch', () => {
    // Trakt omits `next_episode` when nothing aired is left; the button must
    // still have something to offer, exactly like the anime wrap to episode 1
    // — but flagged, so the UI says "Log rewatch" instead of naming S1E1 as
    // if it were up next.
    expect(nextEpisodeFromProgress({ watchedKeys: NO_WATCHED })).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
    });
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
      rewatch: false,
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
    // Simkl numbers anime absolutely; that shape leaking onto a show must
    // fall back to the season picker rather than mislabel the episode.
    expect(
      nextEpisodeFromSimklEntry(midItem, {
        nextToWatch: { episode: 11, date: null },
      }),
    ).toBeNull();
  });

  test('an entry with nothing left wraps to S1E1 as a rewatch', () => {
    expect(nextEpisodeFromSimklEntry(doneItem, {})).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
    });
  });

  test('a show outside the watching list starts fresh at S1E1', () => {
    expect(nextEpisodeFromSimklEntry(freshItem, null)).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: false,
    });
  });

  test('a finished show outside the watching list offers a rewatch', () => {
    expect(nextEpisodeFromSimklEntry(doneItem, null)).toEqual({
      season: 1,
      number: 1,
      aired: true,
      rewatch: true,
    });
  });

  test('a mid-show item without an entry is unnameable', () => {
    // The snapshot that knows its next episode doesn't list it — guessing a
    // season from a flat count would misfile the log.
    expect(nextEpisodeFromSimklEntry(midItem, null)).toBeNull();
  });
});

describe('seriesEpisodeLabel', () => {
  test('renders the compact SxxEyy form the button uses', () => {
    expect(seriesEpisodeLabel({ season: 2, number: 5 })).toBe('S2E5');
    expect(seriesEpisodeLabel({ season: 1, number: 12 })).toBe('S1E12');
  });
});
