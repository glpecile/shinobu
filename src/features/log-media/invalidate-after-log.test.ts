import { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

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
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web },
}));
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('@/lib/providers/serializd/transport', () => ({
  serializdFetch: async () => new Response('{}'),
  serializdBaseUrl: 'https://api.test',
}));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { invalidateAfterLog } = await import('./use-log-media');
const { watchlistQueryKeys } = await import('@/state/queries/watchlist');
const { letterboxdQueryKeys } = await import('@/state/queries/letterboxd');
const { hardcoverQueryKeys } = await import('@/state/queries/hardcover');

const ITEM: NormalizedMediaItem = {
  id: 'trakt-1',
  title: 'Show',
  coverImage: '',
  type: 'TV',
  currentProgress: 3,
  progressUnit: 'episode',
  lastUpdated: '2026-07-22T00:00:00.000Z',
  externalIds: { trakt: 1, anilist: 9 },
};

function film(externalIds: NormalizedMediaItem['externalIds']): NormalizedMediaItem {
  return { ...ITEM, type: 'MOVIE', externalIds };
}

function recordingClient(): { client: QueryClient; keys: string[] } {
  const keys: string[] = [];
  const client = {
    cancelQueries: () => Promise.resolve(),
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push(queryKey.join('/'));
    },
  } as unknown as QueryClient;
  return { client, keys };
}

describe('invalidateAfterLog (plan 0019 U4)', () => {
  test('a successful Trakt log recomputes Up Next and refreshes the watchlist', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['trakt']);
    expect(keys).toContain('up-next/inputs');
    expect(keys).toContain('trakt/show-progress/1');
    expect(keys).toContain('trakt/watchlist');
    expect(keys).toContain('watchlist/inputs');
    expect(keys).toContain('trakt/watched-shows');
    expect(keys).not.toContain('trakt/watched-movies');
  });

  test('a successful Trakt film log refreshes watched movies only', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, { ...ITEM, type: 'MOVIE' }, ['trakt']);
    expect(keys).toContain('trakt/watched-movies');
    expect(keys).not.toContain('trakt/watched-shows');
    expect(keys).not.toContain('trakt/show-progress/1');
  });

  test('a successful AniList log recomputes them, and the entries read behind them', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['anilist']);
    expect(keys).toContain('up-next/inputs');
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys).toContain('watchlist/inputs');
  });

  test('an AniList manga log refreshes the manga read only', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, { ...ITEM, type: 'MANGA' }, ['anilist']);
    expect(keys).toContain('anilist/current-manga-entries');
    expect(keys).not.toContain('anilist/current-anime-entries');
  });

  test('a log that reached neither provider leaves the slot alone', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['letterboxd']);
    expect(keys).not.toContain('up-next/inputs');
    expect(keys).not.toContain('watchlist/inputs');
  });

  test('a Simkl-only film log makes provider and gathered caches stale without a derived removal', () => {
    const client = new QueryClient();
    const keys = [
      ['simkl', 'all-items', 'all', 'plantowatch'],
      ['simkl', 'activities'],
      ['up-next', 'inputs'],
      watchlistQueryKeys.inputs(),
    ];
    for (const queryKey of keys) client.setQueryData(queryKey, {});

    invalidateAfterLog(client, { ...ITEM, type: 'MOVIE' }, ['simkl']);

    for (const queryKey of keys) {
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
    client.clear();
  });

  test('a book log refreshes only the cached lists that hold the book', () => {
    const client = new QueryClient();
    client.setQueryData(hardcoverQueryKeys.list(42), {
      pages: [{ entries: [{ item: { externalIds: { hardcover: 7 } } }] }],
      pageParams: [1],
    });
    client.setQueryData(hardcoverQueryKeys.list(43), {
      pages: [{ entries: [{ item: { externalIds: { hardcover: 8 } } }] }],
      pageParams: [1],
    });
    invalidateAfterLog(
      client,
      { ...ITEM, type: 'BOOK', externalIds: { hardcover: 7 } },
      ['hardcover'],
    );
    expect(client.getQueryState(hardcoverQueryKeys.list(42))?.isInvalidated).toBe(true);
    expect(client.getQueryState(hardcoverQueryKeys.list(43))?.isInvalidated).toBe(false);
    client.clear();
  });

  test('a Letterboxd log invalidates only the logged film’s watch reads', () => {
    const client = new QueryClient();
    const bySlug = letterboxdQueryKeys.filmWatch('u', film({ letterboxd: 'inception' }));
    const byTmdb = letterboxdQueryKeys.filmWatch('u', film({ tmdb: 27205 }));
    const otherFilm = letterboxdQueryKeys.filmWatch('u', film({ letterboxd: 'heat' }));
    for (const queryKey of [bySlug, byTmdb, otherFilm]) client.setQueryData(queryKey, {});
    client.setQueryData(letterboxdQueryKeys.slug(27205), 'inception');

    for (const externalIds of [{ letterboxd: 'inception' }, { tmdb: 27205 }]) {
      for (const queryKey of [bySlug, byTmdb, otherFilm]) client.setQueryData(queryKey, {});
      invalidateAfterLog(client, film(externalIds), ['letterboxd']);
      expect(client.getQueryState(bySlug)?.isInvalidated).toBe(true);
      expect(client.getQueryState(byTmdb)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherFilm)?.isInvalidated).toBe(false);
    }
    client.clear();
  });

  test('recomputes Up Next last, after every provider cache it reads', () => {
    const { client, keys } = recordingClient();
    // `invalidateQueries` triggers active refetches synchronously, so Up Next
    // reads stale provider caches if invalidated before them.
    invalidateAfterLog(client, ITEM, ['trakt', 'anilist', 'simkl', 'serializd']);
    const watchlistIndex = keys.indexOf('watchlist/inputs');
    expect(watchlistIndex).toBeGreaterThan(keys.indexOf('trakt/watchlist'));
    expect(watchlistIndex).toBeGreaterThan(keys.indexOf('anilist/current-anime-entries'));
    expect(watchlistIndex).toBeGreaterThan(keys.indexOf('simkl/all-items'));
    expect(keys.indexOf('up-next/inputs')).toBe(keys.length - 1);
  });

  test('an all-skip log still recomputes Up Next — the provider is ahead of the sections', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, [], ['trakt']);
    expect(keys).toContain('up-next/inputs');
    expect(keys).not.toContain('trakt/show-progress/1');
    expect(keys).not.toContain('watchlist/inputs');
  });
});
