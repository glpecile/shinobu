import { describe, expect, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import {
  filterWatchlistEntries,
  parseWatchlistProvider,
  watchlistFilterOptions,
  watchlistProviderCounts,
} from './filter';
import type { WatchlistEntry } from './types';

function entry(id: string, sources: ProviderId[]): WatchlistEntry {
  return {
    id,
    item: { id, title: id, type: 'MOVIE' } as NormalizedMediaItem,
    sources,
    sourceIds: [id],
  };
}

const ENTRIES = [
  entry('dune', ['simkl', 'letterboxd']),
  entry('frieren', ['anilist', 'simkl']),
  entry('andor', ['trakt']),
  entry('aftersun', ['letterboxd']),
];

describe('parseWatchlistProvider', () => {
  test('accepts a registered provider', () => {
    expect(parseWatchlistProvider('letterboxd')).toBe('letterboxd');
  });

  test('a junk param shows the whole watchlist, never an error', () => {
    // A bad URL must degrade to the unfiltered surface — a blank screen with
    // an unnameable filter on it is the failure this guards.
    for (const raw of ['plex', '', undefined, null, 42, ['trakt']]) {
      expect(parseWatchlistProvider(raw)).toBeNull();
    }
  });
});

describe('filterWatchlistEntries', () => {
  test('null is every provider', () => {
    expect(filterWatchlistEntries(ENTRIES, null)).toHaveLength(4);
  });

  test('narrows to the entries that provider holds', () => {
    expect(filterWatchlistEntries(ENTRIES, 'letterboxd').map((e) => e.id)).toEqual([
      'dune',
      'aftersun',
    ]);
  });

  test('a merged entry survives every one of its providers’ filters', () => {
    // The filter narrows, it never partitions: Dune is genuinely on both lists.
    expect(filterWatchlistEntries(ENTRIES, 'simkl').map((e) => e.id)).toContain('dune');
    expect(filterWatchlistEntries(ENTRIES, 'letterboxd').map((e) => e.id)).toContain('dune');
  });
});

describe('watchlistProviderCounts', () => {
  test('counts per provider in registry order, omitting the empty ones', () => {
    expect(watchlistProviderCounts(ENTRIES)).toEqual([
      { provider: 'trakt', count: 1 },
      { provider: 'anilist', count: 1 },
      { provider: 'letterboxd', count: 2 },
      { provider: 'simkl', count: 2 },
    ]);
  });

  test('the counts deliberately exceed the row total', () => {
    // 6 across 4 rows — because two rows are held by two providers each. A sum
    // that matched the total would mean the merge had picked one owner per row,
    // which is exactly what `computeWatchlist` refuses to do.
    const total = watchlistProviderCounts(ENTRIES).reduce((sum, o) => sum + o.count, 0);
    expect(total).toBe(6);
    expect(total).toBeGreaterThan(ENTRIES.length);
  });
});

describe('watchlistFilterOptions', () => {
  test('an active provider holding nothing still gets an option', () => {
    // `?provider=serializd` on a gather where that leg failed: without this the
    // screen shows no rows and no way to see — or clear — the filter that hid
    // them.
    const options = watchlistFilterOptions(ENTRIES, 'serializd');
    expect(options.find((o) => o.provider === 'serializd')).toEqual({
      provider: 'serializd',
      count: 0,
    });
  });

  test('otherwise it is just the providers holding rows', () => {
    expect(watchlistFilterOptions(ENTRIES, 'trakt')).toEqual(
      watchlistProviderCounts(ENTRIES),
    );
    expect(watchlistFilterOptions(ENTRIES, null)).toEqual(
      watchlistProviderCounts(ENTRIES),
    );
  });
});
