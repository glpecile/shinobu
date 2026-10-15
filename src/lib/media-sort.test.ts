import { describe, expect, test } from 'bun:test';

import { filterWatchlistEntries } from '@/features/watchlist/filter';
import type { WatchlistEntry } from '@/features/watchlist/types';
import type { NormalizedMediaItem } from '@/types/media';
import { sortMediaEntries, type MediaSort } from './media-sort';

function entry(id: string, overrides: Partial<NormalizedMediaItem> = {}): WatchlistEntry {
  return {
    id, sources: ['trakt'], sourceIds: [id],
    item: { id, title: id, type: 'MOVIE', coverImage: '', currentProgress: 0,
      progressUnit: 'episode', lastUpdated: '', externalIds: {}, ...overrides },
  };
}

describe('sortMediaEntries', () => {
  const entries = Object.freeze([
    entry('film', { runtime: 100, year: 1995 }),
    entry('series', { type: 'TV', runtime: 45, year: 2020, totalEpisodes: 100, currentProgress: 99 }),
    entry('anime-film', { type: 'ANIME', isFilm: true, runtime: 90, year: 2000 }),
    entry('anime', { type: 'ANIME', runtime: 24, totalEpisodes: 28, year: 2024 }),
    entry('missing'),
  ]);

  test.each([
    ['runtime-asc', ['anime-film', 'film', 'anime', 'series', 'missing']],
    ['runtime-desc', ['series', 'anime', 'film', 'anime-film', 'missing']],
    ['year-asc', ['film', 'anime-film', 'series', 'anime', 'missing']],
    ['year-desc', ['anime', 'series', 'anime-film', 'film', 'missing']],
    ['default', ['film', 'series', 'anime-film', 'anime', 'missing']],
  ] as [MediaSort, string[]][])('%s uses catalogue values without changing input order', (sort, expected) => {
    expect(sortMediaEntries(entries, sort).map((row) => row.id)).toEqual(expected);
  });

  test('invalid values and manga runtime stay last in either direction; ties use title then entry identity', () => {
    const unknowns = [undefined, 0, -1, NaN, Infinity].map((value, index) =>
      entry(`unknown-${index}`, { runtime: value, year: value }));
    const tied = [entry('b', { title: 'Same', runtime: 24, year: 2001 }), entry('a', { title: 'Same', runtime: 24, year: 2001 })];
    const rows = [entry('manga', { type: 'MANGA', runtime: 1, year: 2000 }), ...unknowns, ...tied];
    for (const sort of ['runtime-asc', 'runtime-desc'] as const) {
      expect(sortMediaEntries(rows, sort).map((row) => row.id)).toEqual(['a', 'b', 'manga', ...unknowns.map((row) => row.id)]);
    }
    for (const sort of ['year-asc', 'year-desc'] as const) {
      const sorted = sortMediaEntries([...unknowns, ...tied, entry('fraction', { year: 2000.5 })], sort);
      expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'fraction', ...unknowns.map((row) => row.id)]);
    }
    expect(sortMediaEntries(rows.toReversed(), 'runtime-asc')).toEqual(sortMediaEntries(rows, 'runtime-asc'));
  });

  test('composes with tracker filtering and sorts newly loaded entries without changing the reset order', () => {
    const hidden: WatchlistEntry = { ...entry('other', { runtime: 1 }), sources: ['letterboxd'] };
    const loaded = [...entries, hidden];
    const filtered = filterWatchlistEntries(loaded, 'trakt');
    expect(sortMediaEntries(filtered, 'runtime-asc').map((row) => row.id)).toEqual(['anime-film', 'film', 'anime', 'series', 'missing']);
    const nextPage = [...filtered, entry('short', { runtime: 10 })];
    expect(sortMediaEntries(nextPage, 'runtime-asc')[0].id).toBe('short');
    expect(sortMediaEntries(nextPage, 'default').map((row) => row.id)).toEqual(['film', 'series', 'anime-film', 'anime', 'missing', 'short']);
  });

  test('series need a valid episode count for an estimated total, independent of watched progress', () => {
    const unknowns = [undefined, 0, -1, 2.5, Infinity].map((totalEpisodes, index) =>
      entry(`unknown-${index}`, { type: 'TV', runtime: 24, totalEpisodes }));
    const series = entry('series', { type: 'TV', runtime: 24, totalEpisodes: 10, currentProgress: 9 });
    const film = entry('film', { runtime: 100, totalEpisodes: 99 });
    expect(sortMediaEntries([...unknowns, series, film], 'runtime-asc').map(row => row.id))
      .toEqual(['film', 'series', ...unknowns.map(row => row.id)]);
    expect(sortMediaEntries([...unknowns, series, film], 'runtime-desc').map(row => row.id))
      .toEqual(['series', 'film', ...unknowns.map(row => row.id)]);
  });
});
