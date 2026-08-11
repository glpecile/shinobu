import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { describe, expect, mock, test } from 'bun:test';

// Same edge stubs as the other query-layer suites: MMKV, react-native's entry
// point and the native fetch client don't load under bun. Nothing under test
// touches them — the persister's storage shim is never constructed here.
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
const { letterboxdQueryKeys } = await import('./letterboxd');
const { deserialize, isPersistedQueryKey, serialize } = await import('./persist');
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

  test('survives a nested and an empty Set', () => {
    const data = { a: { b: new Set([1]) }, c: new Set<string>() };
    const restored = restoredData(clientWith(traktQueryKeys.showProgress(1), data)) as {
      a: { b: Set<number> };
      c: Set<string>;
    };

    expect(restored.a.b.has(1)).toBe(true);
    expect(restored.c.size).toBe(0);
  });

  // Regression, and a real crash rather than a hypothetical: ani.zip episode
  // maps are `ReadonlyMap` and `['mapping','anizip-episodes']` has been on the
  // allowlist since the home-feed restore landed. Without a codec they restored
  // as `{}`, which is the *worst* shape — `canonicalSeasonTitle`'s
  // `map.size === 0` guard passes (`undefined === 0` is false) and the next
  // line calls `map.values()`, so every cold-started anime details screen with
  // a mapping threw "undefined is not a function".
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
  });

  // The allowlist exists to keep the unbounded caches off disk — web's
  // localStorage fallback has a few MB, and none of these help a cold start.
  test('rejects the unbounded per-item and per-query caches', () => {
    expect(isPersistedQueryKey(traktQueryKeys.search('cowboy bebop', 20))).toBe(false);
    expect(isPersistedQueryKey(anilistQueryKeys.search('bebop', 20))).toBe(false);
    expect(isPersistedQueryKey(traktQueryKeys.images('TV', 1))).toBe(false);
    expect(isPersistedQueryKey(traktQueryKeys.seasons(1))).toBe(false);
    expect(isPersistedQueryKey(anilistQueryKeys.episodes(1))).toBe(false);
    expect(isPersistedQueryKey(['media-details', 'trakt-1'])).toBe(false);
    expect(isPersistedQueryKey(['tmdb', 'person', 1])).toBe(false);
    expect(isPersistedQueryKey(['mapping', 'trakt-search', 'bebop', 1998])).toBe(false);
    expect(isPersistedQueryKey(['mapping', 'season-layout', 1, 2])).toBe(false);
  });

  test('matches on whole segments, not string prefixes', () => {
    expect(isPersistedQueryKey(['trakt', 'watched-shows-elsewhere'])).toBe(false);
    expect(isPersistedQueryKey(['up-next'])).toBe(false);
    expect(isPersistedQueryKey(['watchlist-elsewhere', 'inputs'])).toBe(false);
  });
});
