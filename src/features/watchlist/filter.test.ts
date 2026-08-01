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

  test('the counts deliberately exceed the row total', () => {
    // 6 across 4 rows — because two rows are held by two providers each. A sum
    // that matched the total would mean the merge had picked one owner per row,
    // which is exactly what `computeWatchlist` refuses to do.
    const total = watchlistProviderCounts(ENTRIES).reduce((sum, o) => sum + o.count, 0);
    expect(total).toBe(6);
    expect(total).toBeGreaterThan(ENTRIES.length);
  });
});

describe('the counts are honest about paging', () => {
  test('a partial count renders as a floor', () => {
    // A bare "46" asserts a completeness the app has no evidence for while
    // Letterboxd's scrape still has pages — and the number visibly grows as
    // you scroll, which reads as a bug rather than as paging.
    expect(formatWatchlistCount(46, true)).toBe('46+');
    expect(formatWatchlistCount(46, false)).toBe('46');
  });

  test('the total is partial when any single leg is', () => {
    // An unread Letterboxd page can hold a film no other tracker has, so the
    // merged total cannot be exact while one source is still paging.
    expect(watchlistTotal(ENTRIES, ['letterboxd'])).toEqual({
      count: 4,
      partial: true,
    });
    expect(watchlistTotal(ENTRIES)).toEqual({ count: 4, partial: false });
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
      partial: false,
    });
  });

  test('the partial flag survives the synthesized-option path', () => {
    // The deep-linked-but-empty branch builds its rows separately, so it has
    // its own chance to drop the flag.
    const options = watchlistFilterOptions(ENTRIES, 'serializd', [
      'serializd',
      'letterboxd',
    ]);
    expect(options.find((o) => o.provider === 'serializd')?.partial).toBe(true);
    expect(options.find((o) => o.provider === 'letterboxd')?.partial).toBe(true);
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
