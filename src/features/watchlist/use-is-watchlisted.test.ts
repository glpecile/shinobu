import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NormalizedMediaItem } from '@/types/media';

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
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
const { watchlistSourcesFor } = await import('./use-is-watchlisted');

import type { WatchlistInput } from './types';

function film(id: string, overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
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

describe('watchlistSourcesFor (owner report 2026-08-01)', () => {
  test("a second lookup does not rebuild the inputs' keys", () => {
    let reads = 0;
    const counted = (item: NormalizedMediaItem): NormalizedMediaItem =>
      Object.defineProperty({ ...item }, 'externalIds', {
        get() {
          reads += 1;
          return item.externalIds;
        },
        enumerable: true,
      });
    const inputs = [
      input(counted(film('letterboxd-heat', { externalIds: { tmdb: 949 } })), 'letterboxd'),
      input(counted(film('trakt-heat', { externalIds: { tmdb: 949 } })), 'trakt'),
      input(counted(film('simkl-ronin', { title: 'Ronin', year: 1998 })), 'simkl'),
    ];
    expect(
      watchlistSourcesFor(inputs, film('tmdb-949', { externalIds: { tmdb: 949 } })),
    ).toEqual(['letterboxd', 'trakt']);
    reads = 0;
    expect(watchlistSourcesFor(inputs, film('tmdb-9', { title: 'Ronin', year: 1998 }))).toEqual([
      'simkl',
    ]);
    expect(reads).toBe(0);
  });

  test('names every provider whose row matches, across id spaces', () => {
    const inputs = [
      input(film('letterboxd-heat-1995', { externalIds: { tmdb: 949 } }), 'letterboxd'),
      input(film('trakt-1', { externalIds: { tmdb: 949 } }), 'trakt'),
    ];
    const sources = watchlistSourcesFor(inputs, film('tmdb-949', { externalIds: { tmdb: 949 } }));
    expect([...sources].sort()).toEqual(['letterboxd', 'trakt']);
  });

  test('an unrelated film matches nothing', () => {
    const inputs = [input(film('trakt-1', { externalIds: { tmdb: 949 } }), 'trakt')];
    const other = film('trakt-9', { title: 'Ronin', year: 1998, externalIds: { tmdb: 9 } });
    expect(watchlistSourcesFor(inputs, other)).toEqual([]);
  });

  test('an id-less, year-less item still matches its own row by item id', () => {
    const bare = film('serializd-3', { type: 'TV', year: undefined });
    expect(watchlistSourcesFor([input(bare, 'trakt')], bare)).toEqual(['trakt']);
  });

  test('a provider contributing two matching rows is named once', () => {
    const rows = [
      input(film('trakt-1', { externalIds: { tmdb: 949 } }), 'trakt'),
      input(film('trakt-2', { externalIds: { tmdb: 949 } }), 'trakt'),
    ];
    expect(watchlistSourcesFor(rows, film('trakt-1', { externalIds: { tmdb: 949 } }))).toEqual([
      'trakt',
    ]);
  });
});

describe('the hook registers no query observer', () => {
  // TanStack Query treats `useQuery({ queryFn: skipToken })` as an active observer,
  // so `invalidateQueries` on the shared key throws when no real observer is mounted.
  const code = readFileSync(join(import.meta.dir, 'use-is-watchlisted.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  test('does not reach for useQuery or skipToken on the shared key', () => {
    expect(code).not.toContain('skipToken');
    expect(code).not.toMatch(/\buseQuery\b/);
  });

  test('subscribes to the cache instead', () => {
    expect(code).toContain('useSyncExternalStore');
    expect(code).toContain('getQueryData');
  });
});
