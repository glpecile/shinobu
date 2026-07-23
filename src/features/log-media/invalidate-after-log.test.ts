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

  test('a successful AniList log recomputes them, and the entries read behind them', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['anilist']);
    expect(keys).toContain('up-next/inputs');
    // The items key derives from the entries key — invalidating only the
    // former would re-derive from a stale cache (U2).
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys).toContain('anilist/current-anime');
  });

  test('a log that reached neither provider leaves the slot alone', () => {
    const { client, keys } = recordingClient();
    invalidateAfterLog(client, ITEM, ['letterboxd']);
    expect(keys).not.toContain('up-next/inputs');
  });
});
