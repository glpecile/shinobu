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

const {
  anilistQueryKeys,
  fetchCurrentAnime,
  fetchPlannedAnime,
  fetchWatchlistAnime,
} = await import('./anilist');

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

/**
 * Plan 0031 U12. The mirror slice: the cross-provider watchlist's AniList leg.
 * It is a *selector over the already-cached entries*, not a query — every test
 * here seeds `currentAnimeEntries()` and no test seeds `plannedAnime()`, which
 * is the shape of the zero-extra-request contract
 * (docs/solutions/anilist-rate-limit-retry-storm.md).
 */
describe('fetchPlannedAnime — the watchlist selector', () => {
  test('returns only PLANNING entries, off the same cached read', async () => {
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(1, 'CURRENT'),
      entry(2, 'PLANNING'),
      entry(3, 'CURRENT'),
      entry(4, 'PLANNING'),
    ]);

    const planned = await fetchPlannedAnime(client);
    expect(planned.map((e) => e.item.id)).toEqual(['anilist-2', 'anilist-4']);
    // No request was made and nothing was cached under the derived key — the
    // read costs 0 calls because plan 0030 already paid for these entries.
    expect(client.getQueryData(anilistQueryKeys.plannedAnime())).toBeUndefined();
  });

  test('carries the MediaList entry id through as a hint for the removal path', async () => {
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(2, 'PLANNING'),
    ]);

    const planned = await fetchPlannedAnime(client);
    // A hint only (R36): the removal guard re-reads the entry in-effect and
    // deletes by *that* id. Asserted here so the field is known to survive the
    // slice, not so anything may guard on it.
    expect(planned[0]?.entryId).toBe(200);
  });

  test('a list of nothing but watching yields an empty watchlist leg', async () => {
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(5, 'CURRENT'),
    ]);

    expect(await fetchPlannedAnime(client)).toEqual([]);
  });
});

/**
 * Plan 0035 U1/KTD1. The watchlist's slice widens to CURRENT ∪ PLANNING —
 * as a *fourth selector*, which is the whole point: the three that existed keep
 * their own slices, so the status gate below still has three narrow readers to
 * be a gate over.
 */
describe('fetchWatchlistAnime — CURRENT ∪ PLANNING (plan 0035 R1)', () => {
  test('returns both statuses off the same cached read, in list order', async () => {
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(1, 'CURRENT'),
      entry(2, 'PLANNING'),
      entry(3, 'CURRENT'),
    ]);

    const watchlist = await fetchWatchlistAnime(client);
    expect(watchlist.map((e) => e.item.id)).toEqual([
      'anilist-1',
      'anilist-2',
      'anilist-3',
    ]);
    // Still zero extra requests: nothing was cached under a derived key.
    expect(client.getQueryData(anilistQueryKeys.plannedAnime())).toBeUndefined();
  });

  test('a CURRENT entry keeps its entry-id hint for the removal path', async () => {
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [
      entry(9, 'CURRENT'),
    ]);

    const watchlist = await fetchWatchlistAnime(client);
    expect(watchlist[0]?.entryId).toBe(900);
    // The status rides along too — it is what tells the picker the removal is
    // destructive (plan 0035 R3).
    expect(watchlist[0]?.status).toBe('CURRENT');
  });
});

/**
 * The four-way regression gate (plan 0031 R28, widened by plan 0035 R2), naming
 * `docs/solutions/anilist-shared-list-query-status-gate.md` on purpose: one
 * request carries both statuses, and every consumer takes a *slice*. A future
 * "simplification" that deletes `compute.ts`'s PLANNING gate on the grounds
 * that plan-to-watch is displayed now anyway — or that drops
 * `fetchCurrentAnime`'s CURRENT filter for the same reason — floods Continue
 * Watching with the user's whole backlog. This test is what fails first.
 *
 * Plan 0035 added `fetchWatchlistAnime` over the top of exactly this fixture:
 * CURRENT reaching one more read-only surface is not what the gate restricts,
 * and these assertions are the proof that widening it changed nothing else.
 */
describe('the PLANNING gate (anilist-shared-list-query-status-gate.md)', () => {
  test('a mid-run PLANNING entry reaches the watchlist and nowhere in Up Next or the row', async () => {
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

    // 1. The watchlist surface sees it — through both selectors.
    const planned = await fetchPlannedAnime(client);
    expect(planned.map((e) => e.item.id)).toEqual(['anilist-42']);
    expect((await fetchWatchlistAnime(client)).map((e) => e.item.id)).toEqual([
      'anilist-42',
    ]);

    // 2. The "Your Anime" row does not.
    expect(await fetchCurrentAnime(client)).toEqual([]);

    // 3. Neither Up Next section does — not Continue Watching (it is not
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

  test('the same fixture with the entry CURRENT is untouched by the watchlist slice', async () => {
    // The other half of R28: adding a third consumer changed nothing for the
    // status that already existed.
    const NOW = new Date(2026, 6, 23, 20, 0);
    const current: AniListCurrentEntry = {
      ...entry(42, 'CURRENT'),
      nextAiring: {
        episode: 6,
        airingAt: new Date(2026, 6, 22, 20, 0).toISOString(),
      },
    };
    const client = new QueryClient();
    client.setQueryData(anilistQueryKeys.currentAnimeEntries(), [current]);

    expect(await fetchPlannedAnime(client)).toEqual([]);
    expect((await fetchCurrentAnime(client)).map((item) => item.id)).toEqual([
      'anilist-42',
    ]);
    // …and the watchlist now sees it as well (plan 0035 R1) — the one thing
    // that changed, stated here rather than left implicit.
    expect((await fetchWatchlistAnime(client)).map((e) => e.item.id)).toEqual([
      'anilist-42',
    ]);
    const upNext = computeUpNext(
      {
        progress: [],
        calendar: [],
        releases: [],
        anilist: [current],
        errors: [],
      },
      NOW,
    );
    expect(upNext.continueWatching.map((e) => e.item.id)).toEqual(['anilist-42']);
  });
});
