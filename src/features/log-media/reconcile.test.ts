import { describe, expect, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';
import {
  anilistHasEpisodes,
  anilistHasFilm,
  reconcileLogTargets,
  traktHasEpisodes,
  traktHasFilm,
} from './reconcile';

describe('reconcileLogTargets (the plan 0011 sync rule)', () => {
  test('nobody has it → log everywhere', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: false },
        { provider: 'anilist', hasIt: false },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'log' },
      { provider: 'anilist', action: 'log' },
    ]);
  });

  test('one side ahead → catch up the other only, never double-log', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: true },
        { provider: 'anilist', hasIt: false },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'skip' },
      { provider: 'anilist', action: 'log' },
    ]);
  });

  test('parity → rewatch on all', () => {
    expect(
      reconcileLogTargets([
        { provider: 'trakt', hasIt: true },
        { provider: 'anilist', hasIt: true },
      ]),
    ).toEqual([
      { provider: 'trakt', action: 'rewatch' },
      { provider: 'anilist', action: 'rewatch' },
    ]);
  });
});

function movie(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return {
    id: 'x',
    title: 'x',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated: '2026-07-14T00:00:00Z',
    externalIds,
  };
}

describe('traktHasFilm', () => {
  const watched = [movie({ trakt: 1, tmdb: 100 })];

  test('matches on trakt id', () => {
    expect(traktHasFilm(watched, movie({ trakt: 1 }))).toBe(true);
  });

  test('matches on tmdb when the item has no trakt id (ani.zip-mapped anime)', () => {
    expect(traktHasFilm(watched, movie({ tmdb: 100, anilist: 5 }))).toBe(true);
  });

  test('no shared id → not watched', () => {
    expect(traktHasFilm(watched, movie({ tmdb: 999 }))).toBe(false);
  });
});

describe('traktHasEpisodes', () => {
  const completed = new Set(['1-1', '1-2', '1-3']);

  test('all intended episodes completed', () => {
    expect(
      traktHasEpisodes(completed, [
        { season: 1, number: 2 },
        { season: 1, number: 3 },
      ]),
    ).toBe(true);
  });

  test('any missing episode → not recorded', () => {
    expect(traktHasEpisodes(completed, [{ season: 1, number: 4 }])).toBe(false);
  });
});

describe('anilist snapshots', () => {
  test('film: COMPLETED or REPEATING counts, CURRENT does not', () => {
    expect(anilistHasFilm({ status: 'COMPLETED', progress: 1 })).toBe(true);
    expect(anilistHasFilm({ status: 'REPEATING', progress: 0 })).toBe(true);
    expect(anilistHasFilm({ status: 'PLANNING', progress: 0 })).toBe(false);
    expect(anilistHasFilm(null)).toBe(false);
  });

  test('episodes: progress covers the highest intended entry episode', () => {
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 5 }, [5])).toBe(true);
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 4 }, [5])).toBe(false);
    expect(anilistHasEpisodes({ status: 'COMPLETED', progress: 0 }, [12])).toBe(true);
    expect(anilistHasEpisodes(null, [1])).toBe(false);
    expect(anilistHasEpisodes({ status: 'CURRENT', progress: 5 }, [])).toBe(false);
  });
});
