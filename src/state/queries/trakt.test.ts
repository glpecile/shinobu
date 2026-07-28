import { describe, expect, mock, test } from 'bun:test';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing here goes near the network — the
// subject is the query-key shape.
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

const { traktQueryKeys } = await import('./trakt');

describe('traktQueryKeys.watchlistRoot (plan 0031 U11)', () => {
  test('is a prefix of every per-sort watchlist key', () => {
    const root = traktQueryKeys.watchlistRoot();
    for (const key of [
      traktQueryKeys.watchlist('all', 'added', 'desc'),
      traktQueryKeys.watchlist('movies', 'rank', 'asc'),
    ]) {
      // TanStack matches by key prefix, so this is exactly what makes one
      // invalidation from a write path refresh a read keyed by a sort the
      // write never knew about.
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });

  test('two different sorts are two different cache entries', () => {
    expect(traktQueryKeys.watchlist('all', 'added', 'desc')).not.toEqual(
      traktQueryKeys.watchlist('all', 'added', 'asc') as never,
    );
  });
});
