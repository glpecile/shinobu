import { describe, expect, test } from 'bun:test';

import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import type { NormalizedMediaItem } from '@/types/media';

import { catchUpEpisodeCode, catchUpQueue } from './queue';

const item = (extra: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem => ({
  id: 'x-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 0,
  progressUnit: 'episode',
  lastUpdated: '2026-09-01T00:00:00.000Z',
  externalIds: {},
  ...extra,
});

function entry(
  overrides: Partial<UpNextEpisodeEntry> & { episode: UpNextEpisodeEntry['episode'] },
): UpNextEpisodeEntry {
  return {
    kind: 'episode',
    id: 'e',
    item: item(),
    status: 'aired',
    source: 'anilist',
    ...overrides,
  };
}

describe('catchUpQueue', () => {
  test('one behind (or unknown) is the entry alone', () => {
    const one = entry({ episode: { number: 3, title: 'T' }, episodesBehind: 1 });
    expect(catchUpQueue(one, {})).toEqual([{ number: 3, title: 'T' }]);
    const unknown = entry({ episode: { season: 2, number: 3 } });
    expect(catchUpQueue(unknown, {})).toEqual([{ season: 2, number: 3 }]);
  });

  test('AniList counts up from the pointer for exactly `episodesBehind`', () => {
    const e = entry({ episode: { number: 3 }, episodesBehind: 4 });
    expect(catchUpQueue(e, {})).toEqual([
      { number: 3 },
      { number: 4 },
      { number: 5 },
      { number: 6 },
    ]);
  });

  test('Simkl anime skips a watched gap and stops at the aired count', () => {
    const e = entry({
      source: 'simkl',
      item: item({ totalEpisodes: 8 }),
      episode: { number: 3 },
      episodesBehind: 3,
    });
    const simkl = { watchedKeys: new Set(['1-1', '1-2', '1-4']), notAiredEpisodes: 2 };
    // 4 is watched → skipped without spending the budget; 6 is the last aired.
    expect(catchUpQueue(e, { simkl })).toEqual([{ number: 3 }, { number: 5 }, { number: 6 }]);
    // A count that overshoots (gaps below the pointer) still stops at aired.
    const deep = entry({ ...e, episodesBehind: 5 });
    expect(catchUpQueue(deep, { simkl })).toEqual([{ number: 3 }, { number: 5 }, { number: 6 }]);
  });

  describe('Trakt', () => {
    const airedEpisodes = [
      { season: 0, number: 1 },
      { season: 1, number: 1 },
      { season: 1, number: 2 },
      { season: 1, number: 3 },
      { season: 2, number: 1 },
      { season: 2, number: 2 },
    ];

    test('walks the aired list from the pointer, minus completed, across seasons', () => {
      const e = entry({
        source: 'trakt',
        episode: { season: 1, number: 3, title: 'Three' },
        episodesBehind: 3,
      });
      const trakt = { airedEpisodes, watchedKeys: new Set(['1-1', '1-2']) };
      expect(catchUpQueue(e, { trakt })).toEqual([
        { season: 1, number: 3, title: 'Three' },
        { season: 2, number: 1 },
        { season: 2, number: 2 },
      ]);
    });

    test('a gap above the pointer is skipped, specials never chain', () => {
      const e = entry({ source: 'trakt', episode: { season: 1, number: 2 }, episodesBehind: 9 });
      const trakt = { airedEpisodes, watchedKeys: new Set(['1-1', '2-1']) };
      expect(catchUpQueue(e, { trakt })).toEqual([
        { season: 1, number: 2 },
        { season: 1, number: 3 },
        { season: 2, number: 2 },
      ]);
    });

    test('a pointer the list does not contain chains nothing', () => {
      const e = entry({ source: 'trakt', episode: { season: 3, number: 1 }, episodesBehind: 4 });
      const trakt = { airedEpisodes, watchedKeys: new Set<string>() };
      expect(catchUpQueue(e, { trakt })).toEqual([{ season: 3, number: 1 }]);
    });

    test('a pre-0037 cache (no aired list) falls back to the layout walk', () => {
      const e = entry({ source: 'trakt', episode: { season: 1, number: 3 }, episodesBehind: 2 });
      const trakt = { watchedKeys: new Set<string>() };
      const layout = [
        { season: 1, episodeCount: 3 },
        { season: 2, episodeCount: 2 },
      ];
      expect(catchUpQueue(e, { trakt, layout })).toEqual([
        { season: 1, number: 3 },
        { season: 2, number: 1 },
      ]);
      expect(catchUpQueue(e, { trakt })).toEqual([{ season: 1, number: 3 }]);
    });
  });

  describe('Simkl TV (season layout)', () => {
    const layout = [
      { season: 0, episodeCount: 4 },
      { season: 2, episodeCount: 2 },
      { season: 1, episodeCount: 3 },
    ];

    test('steps across the season boundary in layout order, skipping watched', () => {
      const e = entry({ source: 'simkl', episode: { season: 1, number: 2 }, episodesBehind: 3 });
      const simkl = { watchedKeys: new Set(['1-1', '1-3']) };
      expect(catchUpQueue(e, { layout, simkl })).toEqual([
        { season: 1, number: 2 },
        { season: 2, number: 1 },
        { season: 2, number: 2 },
      ]);
    });

    test('the aired count caps the walk in absolute order', () => {
      const e = entry({
        source: 'simkl',
        item: item({ totalEpisodes: 5 }),
        episode: { season: 1, number: 2 },
        episodesBehind: 4,
      });
      const simkl = { watchedKeys: new Set<string>(), notAiredEpisodes: 1 };
      expect(catchUpQueue(e, { layout, simkl })).toEqual([
        { season: 1, number: 2 },
        { season: 1, number: 3 },
        { season: 2, number: 1 },
      ]);
    });

    test('no layout, or a season the layout lacks, chains nothing', () => {
      const e = entry({ source: 'simkl', episode: { season: 1, number: 2 }, episodesBehind: 3 });
      expect(catchUpQueue(e, {})).toEqual([{ season: 1, number: 2 }]);
      const s4 = entry({ source: 'simkl', episode: { season: 4, number: 1 }, episodesBehind: 3 });
      expect(catchUpQueue(s4, { layout })).toEqual([{ season: 4, number: 1 }]);
    });

    test('a layout that ends before the count does ends the chain', () => {
      const e = entry({ source: 'simkl', episode: { season: 2, number: 1 }, episodesBehind: 6 });
      expect(catchUpQueue(e, { layout, simkl: { watchedKeys: new Set() } })).toEqual([
        { season: 2, number: 1 },
        { season: 2, number: 2 },
      ]);
    });
  });

  test('catchUpEpisodeCode names the domain the number lives in', () => {
    expect(catchUpEpisodeCode({ number: 4 })).toBe('episode 4');
    expect(catchUpEpisodeCode({ season: 2, number: 4 })).toBe('S2E4');
  });
});
