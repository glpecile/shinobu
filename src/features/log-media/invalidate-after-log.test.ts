import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { NormalizedMediaItem } from '@/types/media';

// Same edge stubs as the other query-layer suites: MMKV, the native fetch
// client, the Serializd transport and react-native's entry point don't load
// under bun. The invalidation logic under test is untouched.
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

const { invalidateAfterLog } = await import('./use-log-media');

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

/** Records the keys a run invalidated, joined so they read as paths. */
function recordingClient(): { client: QueryClient; keys: string[] } {
  const keys: string[] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push(queryKey.join('/'));
    },
  } as unknown as QueryClient;
  return { client, keys };
}

describe('invalidateAfterLog (plan 0019 U4)', () => {
  test('a successful Trakt log recomputes the Up Next sections', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['trakt']);
    expect(keys).toContain('up-next/inputs');
    // The per-show progress the sections are computed from still refreshes too.
    expect(keys).toContain('trakt/show-progress/1');
  });

  test('a successful Trakt log refreshes the watchlist Trakt already changed', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['trakt']);
    // Trakt auto-removes a watched show from the watchlist server-side, so the
    // cached read is stale the moment the log lands — and the prefix is what
    // gets named, because this path can't know the type/sort the surface used
    // (plan 0031 U11/KTD-5).
    expect(keys).toContain('trakt/watchlist');
  });

  test('a successful AniList log recomputes them, and the entries read behind them', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['anilist']);
    expect(keys).toContain('up-next/inputs');
    // The items key derives from the entries key — invalidating only the
    // former would re-derive from a stale cache (U2).
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys).toContain('anilist/current-anime');
  });

  test('a successful AniList log drops the entry out of the watchlist slice', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['anilist']);
    // Logging an episode makes the entry CURRENT, so it is no longer plan-to-
    // watch — the watchlist's AniList leg is a third derived key over the same
    // entries read and goes stale on this write too (plan 0031 U12/KTD-5).
    expect(keys).toContain('anilist/planned-anime');
    expect(keys).toContain('anilist/current-anime-entries');
  });

  test('a log that reached neither provider leaves the slot alone', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['letterboxd']);
    expect(keys).not.toContain('up-next/inputs');
  });
});
