import { describe, expect, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import {
  filterWatchlistEntries,
  formatWatchlistCount,
  parseWatchlistProvider,
  watchlistFilterOptions,
  watchlistProviderCounts,
  watchlistTotal,
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
});

describe('watchlistProviderCounts', () => {
  test('counts per provider in registry order, omitting the empty ones', () => {
    expect(watchlistProviderCounts(ENTRIES)).toEqual([
      { provider: 'trakt', count: 1, partial: false },
      { provider: 'anilist', count: 1, partial: false },
      { provider: 'letterboxd', count: 2, partial: false },
      { provider: 'simkl', count: 2, partial: false },
    ]);
  });

  test('a leg with unread pages is flagged partial, and only that leg', () => {
    const counts = watchlistProviderCounts(ENTRIES, ['letterboxd']);
    expect(counts.find((o) => o.provider === 'letterboxd')?.partial).toBe(true);
    expect(counts.filter((o) => o.partial)).toHaveLength(1);
  });
});

describe('the counts are honest about paging', () => {
  test('a partial count renders as a floor', () => {
    expect(formatWatchlistCount(46, true)).toBe('46+');
    expect(formatWatchlistCount(46, false)).toBe('46');
  });

  test('the total is partial when any single leg is', () => {
    expect(watchlistTotal(ENTRIES, ['letterboxd'])).toEqual({
      count: 4,
      partial: true,
    });
    expect(watchlistTotal(ENTRIES)).toEqual({ count: 4, partial: false });
  });
});

describe('watchlistFilterOptions', () => {
  test('an active provider holding nothing still gets an option', () => {
    const options = watchlistFilterOptions(ENTRIES, 'serializd');
    expect(options.find((o) => o.provider === 'serializd')).toEqual({
      provider: 'serializd',
      count: 0,
      partial: false,
    });
  });

  test('the partial flag survives the synthesized-option path', () => {
    const options = watchlistFilterOptions(ENTRIES, 'serializd', ['serializd', 'letterboxd']);
    expect(options.find((o) => o.provider === 'serializd')?.partial).toBe(true);
    expect(options.find((o) => o.provider === 'letterboxd')?.partial).toBe(true);
  });

  test('otherwise it is just the providers holding rows', () => {
    expect(watchlistFilterOptions(ENTRIES, 'trakt')).toEqual(watchlistProviderCounts(ENTRIES));
    expect(watchlistFilterOptions(ENTRIES, null)).toEqual(watchlistProviderCounts(ENTRIES));
  });
});
