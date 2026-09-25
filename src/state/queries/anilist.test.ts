import { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import { computeUpNext } from '@/features/up-next/compute';
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

const { anilistQueryKeys, fetchWatchlistAnime } = await import('./anilist');

function entry(
  anilistId: number,
  status: AniListCurrentEntry['status'],
): AniListCurrentEntry {
  return {
    entryId: anilistId * 100,
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
 * The regression gate (plan 0031 R28, widened by plan 0035 R2), naming
 * `docs/solutions/anilist-shared-list-query-status-gate.md` on purpose: one
 * request carries both statuses, and every consumer takes a *slice*. A future
 * "simplification" that deletes `compute.ts`'s PLANNING gate on the grounds
 * that plan-to-watch is displayed now anyway floods Continue
 * Watching with the user's whole backlog. This test is what fails first.
 */
describe('the PLANNING gate (anilist-shared-list-query-status-gate.md)', () => {
  test('a mid-run PLANNING entry reaches the watchlist and nowhere in Up Next', async () => {
    // Mid-run: five episodes have already aired, progress is 0, the next airing
    // is in the past. Exactly the shape that classifies as `aired` and pours
    // into Continue Watching without the gate.
    const NOW = new Date(2026, 6, 23, 20, 0);
    const planning: AniListCurrentEntry = {
      ...entry(42, 'PLANNING'),
      nextAiring: {
        episode: 6,
        airingAt: new Date(2026, 6, 22, 20, 0).toISOString(),
      },
    };
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [planning]);

    // 1. The watchlist surface sees it.
    expect((await fetchWatchlistAnime(client)).map((e) => e.item.id)).toEqual([
      'anilist-42',
    ]);

    // 2. Neither Up Next section does — not Continue Watching (it is not
    //    "aired, waiting, one tap away"; nothing has been started) and not
    //    Calendar (episode 6 already aired, so there is no event this week).
    const upNext = computeUpNext(
      {
        progress: [],
        calendar: [],
        releases: [],
        anilist: [planning],
        errors: [],
      },
      NOW,
    );
    expect(upNext.continueWatching).toEqual([]);
    expect(upNext.calendar).toEqual([]);
  });
});
