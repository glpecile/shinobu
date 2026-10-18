import { describe, expect, test } from 'bun:test';

import { filterWatchlistEntries } from '@/features/watchlist/filter';
import type { WatchlistEntry } from '@/features/watchlist/types';
import type { NormalizedMediaItem } from '@/types/media';
import { mediaRuntimeMinutes, sortMediaEntries, type MediaSort } from './media-sort';

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
    ['title-asc', ['anime', 'anime-film', 'film', 'missing', 'series']],
    ['title-desc', ['series', 'missing', 'film', 'anime-film', 'anime']],
    ['year-asc', ['film', 'anime-film', 'series', 'anime', 'missing']],
    ['year-desc', ['anime', 'series', 'anime-film', 'film', 'missing']],
    ['default', ['film', 'series', 'anime-film', 'anime', 'missing']],
  ] as [MediaSort, string[]][])('%s uses catalogue values without changing input order', (sort, expected) => {
    expect(sortMediaEntries(entries, sort).map((row) => row.id)).toEqual(expected);
  });

  test('invalid years stay last in either direction; ties use title then entry identity', () => {
    const unknowns = [undefined, 0, -1, NaN, Infinity].map((value, index) =>
      entry(`unknown-${index}`, { year: value }));
    const tied = [entry('b', { title: 'Same', year: 2001 }), entry('a', { title: 'Same', year: 2001 })];
    const rows = [...unknowns, ...tied, entry('fraction', { year: 2000.5 })];
    for (const sort of ['year-asc', 'year-desc'] as const) {
      const sorted = sortMediaEntries(rows, sort);
      expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'fraction', ...unknowns.map((row) => row.id)]);
    }
    expect(sortMediaEntries(rows.toReversed(), 'year-asc')).toEqual(sortMediaEntries(rows, 'year-asc'));
  });

  test('alphabetical sorting ignores case, orders numbers naturally and breaks equal-title ties by identity', () => {
    const rows = [entry('b', { title: 'alien 2' }), entry('ten', { title: 'Alien 10' }), entry('a', { title: 'Alien 2' })];
    expect(sortMediaEntries(rows, 'title-asc').map(row => row.id)).toEqual(['a', 'b', 'ten']);
    expect(sortMediaEntries(rows, 'title-desc').map(row => row.id)).toEqual(['ten', 'a', 'b']);
  });

  test('composes with tracker filtering and sorts newly loaded entries without changing the reset order', () => {
    const hidden: WatchlistEntry = { ...entry('other'), sources: ['letterboxd'] };
    const loaded = [...entries, hidden];
    const filtered = filterWatchlistEntries(loaded, 'trakt');
    expect(sortMediaEntries(filtered, 'title-desc').map((row) => row.id)).toEqual(['series', 'missing', 'film', 'anime-film', 'anime']);
    const nextPage = [...filtered, entry('zebra')];
    expect(sortMediaEntries(nextPage, 'title-desc')[0].id).toBe('zebra');
    expect(sortMediaEntries(nextPage, 'default').map((row) => row.id)).toEqual(['film', 'series', 'anime-film', 'anime', 'missing', 'zebra']);
  });

  test('series need a valid episode count for an estimated total, independent of watched progress', () => {
    const unknowns = [undefined, 0, -1, 2.5, Infinity].map((totalEpisodes, index) =>
      entry(`unknown-${index}`, { type: 'TV', runtime: 24, totalEpisodes }));
    const series = entry('series', { type: 'TV', runtime: 24, totalEpisodes: 10, currentProgress: 9 });
    const film = entry('film', { runtime: 100, totalEpisodes: 99 });
    expect(unknowns.map(row => mediaRuntimeMinutes(row.item))).toEqual(unknowns.map(() => undefined));
    expect(mediaRuntimeMinutes(series.item)).toBe(240);
    expect(mediaRuntimeMinutes(film.item)).toBe(100);
    expect(mediaRuntimeMinutes(entry('manga', { type: 'MANGA', runtime: 24 }).item)).toBeUndefined();
    expect(mediaRuntimeMinutes(entry('invalid', { runtime: Infinity }).item)).toBeUndefined();
  });
});
