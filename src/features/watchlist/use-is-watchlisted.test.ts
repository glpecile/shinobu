import { describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only (MMKV / the native fetch client / react-native's entry
// point don't load under bun) — the function under test is pure.
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
const { isWatchlistedIn } = await import('./use-is-watchlisted');

import type { WatchlistInput } from './types';

function film(
  id: string,
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id,
    title: 'Heat',
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    year: 1995,
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
    ...overrides,
  };
}

function input(item: NormalizedMediaItem, source: WatchlistInput['source']): WatchlistInput {
  return { item, source };
}

describe('isWatchlistedIn (plan 0031 R31)', () => {
  test('recognises the same film across providers by TMDB id, not by item id', () => {
    // The whole point: the details screen opens a TMDB-sourced item whose id
    // will never equal the `letterboxd-<slug>` on the watchlist row.
    const inputs = [
      input(film('letterboxd-heat-1995', { externalIds: { tmdb: 949 } }), 'letterboxd'),
    ];
    expect(isWatchlistedIn(inputs, film('trakt-1', { externalIds: { tmdb: 949 } }))).toBe(
      true,
    );
  });

  test('reuses the merge derivation: title+year matches a scraped row with no ids', () => {
    const inputs = [input(film('letterboxd-heat-1995'), 'letterboxd')];
    expect(isWatchlistedIn(inputs, film('trakt-1'))).toBe(true);
  });

  test('a movie id never answers for the series of the same TMDB number', () => {
    // `watchlistMergeKeys` pairs the id with its movie/tv kind — TMDB numbers
    // the two spaces independently.
    const inputs = [input(film('trakt-1', { externalIds: { tmdb: 1399 } }), 'trakt')];
    const series = film('trakt-2', { type: 'TV', externalIds: { tmdb: 1399 } });
    expect(isWatchlistedIn(inputs, series)).toBe(false);
  });

  test('an unrelated film is false, not true-by-accident', () => {
    const inputs = [input(film('trakt-1', { externalIds: { tmdb: 949 } }), 'trakt')];
    const other = film('trakt-9', { title: 'Ronin', year: 1998, externalIds: { tmdb: 9 } });
    expect(isWatchlistedIn(inputs, other)).toBe(false);
  });

  test('an id-less, year-less item still matches its own row by item id', () => {
    const bare = film('serializd-3', { type: 'TV', year: undefined });
    expect(isWatchlistedIn([input(bare, 'trakt')], bare)).toBe(true);
    expect(isWatchlistedIn([], bare)).toBe(false);
  });

  test('an empty gather is a confident false — "cold cache" is undefined, and the hook, not this', () => {
    expect(isWatchlistedIn([], film('trakt-1'))).toBe(false);
  });
});
