import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { describe, expect, jest, mock, spyOn, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

GlobalRegistrator.register();
const { QueryClient, useQuery } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');

// Native modules do not load under bun; keep the real persister over an
// in-memory MMKV substitute and stub the unused network edges.
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
// `./up-next` and `./watchlist` (imported below) reach `./mapping` /
// `./simkl` (plan 0034 U7), whose auth re-export reaches expo-crypto —
// mirror the surface it consumes instead of loading the whole expo package
// under bun (the `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { anilistQueryKeys } = await import('./anilist');
const { diaryQueryKeys } = await import('./diary-pages');
const { letterboxdQueryKeys } = await import('./letterboxd');
const { createQueryPersister, deserialize, isPersistedQueryKey, serialize, shouldPersistQuery } = await import('./persist');
const { PersistQueryClientProvider } = await import('./persist-provider');
const { traktQueryKeys } = await import('./trakt');
const { simklQueryKeys } = await import('./simkl');
const { upNextQueryKeys } = await import('./up-next');
const { watchlistQueryKeys } = await import('./watchlist');

function clientWith(queryKey: readonly unknown[], data: unknown): PersistedClient {
  return {
    timestamp: 0,
    buster: 'test',
    clientState: {
      mutations: [],
      queries: [
        {
          queryKey: [...queryKey],
          queryHash: JSON.stringify(queryKey),
          state: { data },
        },
      ],
    },
  } as unknown as PersistedClient;
}

function restoredData(client: PersistedClient): unknown {
  return deserialize(serialize(client)).clientState.queries[0]?.state.data;
}

test('a corrupt snapshot is discarded and queries resume without an unhandled rejection', async () => {
  store.set('shinobu.query-cache', '{broken');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const persister = createQueryPersister();
  const error = spyOn(console, 'error').mockImplementation(() => {});
  const warning = spyOn(console, 'warn').mockImplementation(() => {});
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(PersistQueryClientProvider, { client, persister, children });
  const read = renderHook(() => useQuery({ queryKey: ['restore-recovery'], queryFn: async () => 'fresh' }), { wrapper });
  try {
    await waitFor(() => expect(read.result.current.data).toBe('fresh'));
    expect(store.size).toBe(0);
  } finally {
    read.unmount();
    client.clear();
    error.mockRestore();
    warning.mockRestore();
    store.clear();
  }
});

test('batches completed refetches into one current snapshot and flushes pending removals on cleanup', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const keys = Array.from({ length: 20 }, (_, index) => traktQueryKeys.showProgress(index));
  for (const key of keys) client.setQueryData(key, 'cached');
  const persister = createQueryPersister();
  const persistClient = spyOn(persister, 'persistClient');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(PersistQueryClientProvider, { client, persister, children });
  const read = renderHook(() => null, { wrapper });
  const cache = client.getQueryCache();
  const originalGetAll = cache.getAll.bind(cache);
  let visits = 0;
  const getAll = spyOn(cache, 'getAll').mockImplementation(() => {
    const queries = originalGetAll();
    visits += queries.length;
    return queries;
  });
  const responses = keys.map(() => Promise.withResolvers<string>());
  let fetching: Promise<string>[] = [];
  try {
    await act(async () => {});
    jest.useFakeTimers();
    act(() => {
      client.setQueryData(['media-details', 'unpersisted'], 'ignored');
      fetching = keys.map((queryKey, index) => client.fetchQuery({ queryKey, queryFn: () => responses[index]!.promise }));
    });
    act(() => jest.advanceTimersByTime(2_000));
    expect(persistClient).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    getAll.mockClear();
    visits = 0;
    await act(async () => {
      responses.forEach((response, index) => response.resolve(`fresh-${index}`));
      await Promise.all(fetching);
    });
    act(() => jest.advanceTimersByTime(1_999));
    expect(persistClient).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(persistClient).toHaveBeenCalledTimes(1);
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(visits).toBe(21);
    act(() => jest.advanceTimersByTime(1));
    expect(deserialize(store.get('shinobu.query-cache')!).clientState.queries.map((query) => query.state.data)).toEqual(
      keys.map((_, index) => `fresh-${index}`),
    );

    act(() => client.setQueryData(keys[0]!, 'latest'));
    act(() => jest.advanceTimersByTime(1_999));
    act(() => client.removeQueries({ queryKey: keys[1], exact: true }));
    expect(persistClient).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    const saved = persistClient.mock.calls[1]?.[0].clientState.queries;
    expect(saved).toHaveLength(19);
    expect(saved?.[0]?.state.data).toBe('latest');
    expect(saved?.some((query) => JSON.stringify(query.queryKey) === JSON.stringify(keys[1]))).toBe(false);

    act(() => client.removeQueries({ queryKey: ['trakt'], exact: false }));
    read.unmount();
    expect(persistClient).toHaveBeenCalledTimes(3);
    expect(persistClient.mock.calls[2]?.[0].clientState.queries).toEqual([]);
    act(() => jest.advanceTimersByTime(2_000));
    expect(persistClient).toHaveBeenCalledTimes(3);
    expect(deserialize(store.get('shinobu.query-cache')!).clientState.queries).toEqual([]);
  } finally {
    responses.forEach((response) => response.resolve('cleanup'));
    await Promise.allSettled(fetching);
    read.unmount();
    jest.useRealTimers();
    getAll.mockRestore();
    persistClient.mockRestore();
    client.clear();
    store.clear();
  }
});

describe('serialize / deserialize', () => {
  // `show-progress` carries `watchedKeys: Set<string>`, and a plain
  // JSON round-trip turns a Set into `{}` — silently, so the corruption would
  // only surface as a crash on the first `.has()` after a cold start.
  test('round-trips a Set instead of flattening it to {}', () => {
    const data = { watchedKeys: new Set(['1-1', '1-2']) };
    const restored = restoredData(clientWith(traktQueryKeys.showProgress(7), data)) as {
      watchedKeys: Set<string>;
    };

    expect(restored.watchedKeys).toBeInstanceOf(Set);
    expect(restored.watchedKeys.has('1-2')).toBe(true);
    expect(restored.watchedKeys.size).toBe(2);
  });

  test('leaves ordinary JSON payloads untouched', () => {
    const data = { trakt: [{ item: { id: 'trakt-1' } }], anilist: [], errors: [] };
    expect(restoredData(clientWith(upNextQueryKeys.inputs(), data))).toEqual(data);
  });

  // Regression, and a real crash rather than a hypothetical: ani.zip episode
  // maps are `ReadonlyMap` and `['mapping','anizip-episodes']` has been on the
  // allowlist since the home-feed restore landed. Without a codec they restored
  // as `{}`, which is the *worst* shape — `canonicalSeasonTitle`'s
  // `map.size === 0` guard passes (`undefined === 0` is false) and the next
  // line calls `map.values()`, so every cold-started anime details screen with
  // a mapping threw "undefined is not a function".
  // A restored infinite query refetches every page it holds on its first read.
  test('writes only an infinite query\'s first page', () => {
    const data = { pages: [{ slices: {} }, { slices: {} }], pageParams: [{ simkl: 1 }, { simkl: 2 }] };
    expect(restoredData(clientWith(diaryQueryKeys.feed(['simkl'], '', ''), data))).toEqual({
      pages: [{ slices: {} }],
      pageParams: [{ simkl: 1 }],
    });
  });

  test('round-trips a Map instead of flattening it to {}', () => {
    const data = new Map([
      [1, { season: 1, number: 1 }],
      [2, { season: 1, number: 2 }],
    ]);
    const restored = restoredData(
      clientWith(['mapping', 'anizip-episodes', 154587], data),
    ) as Map<number, { season: number; number: number }>;

    expect(restored).toBeInstanceOf(Map);
    expect(restored.size).toBe(2);
    expect(restored.get(2)).toEqual({ season: 1, number: 2 });
    // The exact call that threw.
    expect([...restored.values()].map((episode) => episode.season)).toEqual([1, 1]);
  });

  test('survives a nested and an empty Map, and a Map beside a Set', () => {
    const data = {
      a: { b: new Map([['k', 1]]) },
      c: new Map<string, number>(),
      d: new Set(['x']),
    };
    const restored = restoredData(
      clientWith(['mapping', 'anizip-episodes', 1], data),
    ) as {
      a: { b: Map<string, number> };
      c: Map<string, number>;
      d: Set<string>;
    };

    expect(restored.a.b.get('k')).toBe(1);
    expect(restored.c.size).toBe(0);
    expect(restored.d.has('x')).toBe(true);
  });
});

describe('isPersistedQueryKey', () => {
  test('accepts the home critical path, parameterized keys included', () => {
    expect(isPersistedQueryKey(upNextQueryKeys.inputs())).toBe(true);
    expect(isPersistedQueryKey(traktQueryKeys.watchedShows())).toBe(true);
    expect(isPersistedQueryKey(traktQueryKeys.showProgress(1234))).toBe(true);
    expect(isPersistedQueryKey(anilistQueryKeys.currentAnimeEntries())).toBe(true);
    expect(isPersistedQueryKey(anilistQueryKeys.viewer())).toBe(true);
    expect(
      isPersistedQueryKey(anilistQueryKeys.seasonalAnime({ season: 'SUMMER', year: 2026 })),
    ).toBe(true);
    // Written as literals in persist.ts — see the comment there.
    expect(isPersistedQueryKey(['mapping', 'anizip', { anilistId: 1 }])).toBe(true);
    expect(isPersistedQueryKey(['mapping', 'anizip-episodes', 1])).toBe(true);
    expect(isPersistedQueryKey(letterboxdQueryKeys.watchlist('gian'))).toBe(true);
    // The trending rows are Simkl's since plan 0034 — these, not Trakt's old
    // trending keys, are what must restore with the rest of the feed.
    expect(isPersistedQueryKey(simklQueryKeys.trending('movies'))).toBe(true);
    expect(isPersistedQueryKey(simklQueryKeys.trending('tv'))).toBe(true);
    // The cross-provider watchlist gather (plan 0031): without it this is the
    // one home row that pops in as a skeleton after every cold start.
    expect(isPersistedQueryKey(watchlistQueryKeys.inputs())).toBe(true);
    expect(isPersistedQueryKey(diaryQueryKeys.feed(['simkl'], '', ''))).toBe(true);
    expect(isPersistedQueryKey(letterboxdQueryKeys.lists('gian', 'liked'))).toBe(true);
  });

  // The allowlist exists to keep the unbounded caches off disk — web's
  // localStorage fallback has a few MB, and none of these help a cold start.
  test('rejects the unbounded per-item and per-query caches', () => {
    expect(isPersistedQueryKey(traktQueryKeys.search('cowboy bebop', 20))).toBe(false);
    expect(isPersistedQueryKey(anilistQueryKeys.search('bebop', 20))).toBe(false);
    expect(isPersistedQueryKey(traktQueryKeys.images('TV', 1))).toBe(false);
    expect(isPersistedQueryKey(traktQueryKeys.seasons(1))).toBe(false);
    expect(isPersistedQueryKey(['media-details', 'trakt-1'])).toBe(false);
    expect(isPersistedQueryKey(['tmdb', 'person', 1])).toBe(false);
    expect(isPersistedQueryKey(['mapping', 'trakt-search', 'bebop', 1998])).toBe(false);
    expect(isPersistedQueryKey(['mapping', 'season-layout', 1, 2])).toBe(false);
    expect(isPersistedQueryKey(diaryQueryKeys.filmPlays(['simkl'], { tmdb: 1 }))).toBe(false);
  });

  test('matches on whole segments, not string prefixes', () => {
    expect(isPersistedQueryKey(['trakt', 'watched-shows-elsewhere'])).toBe(false);
    expect(isPersistedQueryKey(['up-next'])).toBe(false);
    expect(isPersistedQueryKey(['watchlist-elsewhere', 'inputs'])).toBe(false);
  });
});

test('partial streamed gathers persist only after their final provider settles', async () => {
  const client = new QueryClient();
  for (const queryKey of [upNextQueryKeys.inputs(), watchlistQueryKeys.inputs()]) {
    const query = client.getQueryCache().build<unknown, Error, unknown, readonly unknown[]>(client, { queryKey });
    query.setState({ status: 'success', fetchStatus: 'fetching', data: { inputs: [] } });
    expect(shouldPersistQuery(query)).toBe(false);
    query.setState({ fetchStatus: 'idle' });
    expect(shouldPersistQuery(query)).toBe(true);
  }
  client.clear();
});
