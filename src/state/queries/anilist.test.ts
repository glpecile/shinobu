import { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing this suite asserts goes near the
// network — the widened list read is seeded into the query cache directly, so
// the selector is exercised on its own.
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

const { anilistQueryKeys, fetchCurrentAnime } = await import('./anilist');

function entry(
  anilistId: number,
  status: AniListCurrentEntry['status'],
): AniListCurrentEntry {
  return {
    item: {
      id: `anilist-${anilistId}`,
      title: `Anime ${anilistId}`,
      coverImage: '',
      type: 'ANIME',
      currentProgress: status === 'CURRENT' ? 3 : 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { anilist: anilistId },
    },
    status,
    nextAiring: null,
    totalEpisodes: 12,
  };
}

/**
 * Plan 0030 KTD-3, the second half of the gate. One request now returns both
 * statuses so the 30 req/min budget stays untouched
 * (docs/solutions/anilist-rate-limit-retry-storm.md), which means the two
 * consumers of that one cached list each have to take their own slice. This is
 * the "Your Anime" row's slice: everything CURRENT and nothing else.
 */
describe('fetchCurrentAnime — the "Your Anime" row selector', () => {
  test('excludes PLANNING entries from the row', async () => {
    const client = new QueryClient();
    // Seeded fresh, so `fetchQuery` serves it from cache and the selector runs
    // over exactly the shape the widened read produces.
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(1, 'CURRENT'),
      entry(2, 'PLANNING'),
      entry(3, 'CURRENT'),
    ]);

    const items = await fetchCurrentAnime(client);
    expect(items.map((item) => item.id)).toEqual(['anilist-1', 'anilist-3']);
  });

  test('a list of nothing but plan-to-watch yields an empty row', async () => {
    // Not "no anime connected" — an empty row is the honest answer when the
    // user has planned titles and started none of them.
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(4, 'PLANNING'),
      entry(5, 'PLANNING'),
    ]);

    expect(await fetchCurrentAnime(client)).toEqual([]);
  });

  test('CURRENT entries reach the row as their plain items, in order', async () => {
    const client = new QueryClient();
    const current = entry(6, 'CURRENT');
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      current,
      entry(7, 'CURRENT'),
    ]);

    const items = await fetchCurrentAnime(client);
    expect(items).toHaveLength(2);
    // The row's contract is `NormalizedMediaItem[]`, unwrapped from the richer
    // entry Up Next reads — unchanged by the widening.
    expect(items[0]).toEqual(current.item);
  });
});
