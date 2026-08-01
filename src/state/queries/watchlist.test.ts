import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing the gatherer *does* is mocked — the
// provider seam is the query client itself (`fakeClient`).
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
// The Simkl leg (plan 0034 U7) drags `state/queries/simkl` into this module
// graph, whose auth import reaches expo-crypto — mirror the surface it
// consumes instead of loading the whole expo package under bun (the
// `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
const {
  fetchWatchlistInputs,
  refreshWatchlistInputs,
  watchlistQueryKeys,
  watchlistReadProviders,
} = await import('./watchlist');
// The Letterboxd leg is keyed by username. Written through the session layer's
// own setter rather than by mocking `@/state/session/letterboxd`: `mock.module`
// is process-wide and bun shares one process across files, so stubbing that
// module here would hand every other suite this suite's username.
const { setProviderSession } = await import('@/state/session/tokens');
setProviderSession('letterboxd', { accessToken: '', username: 'gian' });
const { computeWatchlist } = await import('@/features/watchlist/compute');

function film(id: string, title: string, year: number): NormalizedMediaItem {
  return {
    id,
    title,
    coverImage: '',
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    year,
    lastUpdated: '2026-07-20T00:00:00.000Z',
    externalIds: {},
  };
}

function traktFilm(traktId: number, title: string, listedAt: string): NormalizedMediaItem {
  return {
    ...film(`trakt-${traktId}`, title, 1995),
    // `getWatchlist` puts `listed_at` here (plan 0031 U11) — the merge's sort key.
    lastUpdated: listedAt,
    externalIds: { trakt: traktId, tmdb: 900 + traktId },
  };
}

/** One `/sync/all-items` entry shape `simklInputs` reads (plan 0034 U7). */
function simklEntry(
  simklId: number,
  title: string,
  addedToWatchlistAt: string,
): { item: NormalizedMediaItem; addedToWatchlistAt?: string } {
  return {
    item: {
      ...film(`simkl-${simklId}`, title, 1995),
      externalIds: { simkl: simklId, tmdb: 900 + simklId },
    },
    addedToWatchlistAt,
  };
}

function plannedAnime(anilistId: number): AniListCurrentEntry {
  return {
    item: {
      id: `anilist-${anilistId}`,
      title: `Anime ${anilistId}`,
      coverImage: '',
      type: 'ANIME',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { anilist: anilistId },
    },
    status: 'PLANNING',
    entryId: 5000 + anilistId,
    nextAiring: null,
    totalEpisodes: 12,
  };
}

interface Scenario {
  trakt?: NormalizedMediaItem[];
  /** The widened AniList list read's payload — CURRENT *and* PLANNING. */
  anime?: AniListCurrentEntry[];
  /** Every page the infinite Letterboxd entry already holds. */
  letterboxdPages?: NormalizedMediaItem[][];
  /** `/sync/all-items?status=plantowatch` — bucket doesn't matter to the leg. */
  simkl?: Array<{ item: NormalizedMediaItem; addedToWatchlistAt?: string }>;
  failing?: Array<'trakt' | 'anilist' | 'letterboxd' | 'simkl'>;
}

function fakeClient(scenario: Scenario) {
  const requested: string[] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [root, kind] = queryKey as [string, string];
    requested.push(queryKey.join('/'));
    if (root === 'trakt' && kind === 'watchlist') {
      if (scenario.failing?.includes('trakt') === true) throw new Error('watchlist down');
      return scenario.trakt ?? [];
    }
    if (root === 'anilist' && kind === 'current-anime-entries') {
      if (scenario.failing?.includes('anilist') === true) throw new Error('anilist down');
      return scenario.anime ?? [];
    }
    if (root === 'simkl' && kind === 'all-items') {
      if (scenario.failing?.includes('simkl') === true) throw new Error('simkl down');
      return { shows: scenario.simkl ?? [], movies: [], anime: [] };
    }
    throw new Error(`unexpected query: ${queryKey.join('/')}`);
  };
  const fetchInfiniteQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    requested.push(queryKey.join('/'));
    if (scenario.failing?.includes('letterboxd') === true) {
      throw new Error('letterboxd down');
    }
    return { pages: scenario.letterboxdPages ?? [], pageParams: [] };
  };
  const getQueryData = () =>
    scenario.letterboxdPages == null ? undefined : { pages: scenario.letterboxdPages };
  return {
    client: { fetchQuery, fetchInfiniteQuery, getQueryData } as unknown as QueryClient,
    requested,
  };
}

describe('fetchWatchlistInputs', () => {
  test('stamps the source on every row and asks Trakt exactly once', async () => {
    const { client, requested } = fakeClient({
      trakt: [traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z')],
    });

    const inputs = await fetchWatchlistInputs(client, ['trakt']);

    expect(inputs.inputs).toEqual([
      {
        item: expect.objectContaining({ id: 'trakt-1' }),
        source: 'trakt',
        addedAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    expect(inputs.errors).toEqual([]);
    // One leg, `type=all` — `/sync/watchlist` is a single endpoint, so a
    // movies/shows split would only widen the mount-time burst (R26).
    expect(requested).toEqual(['trakt/watchlist/all/added/desc']);
  });

  test('a disconnected provider is absence, not an error', async () => {
    const { client, requested } = fakeClient({ trakt: [] });

    const inputs = await fetchWatchlistInputs(client, ['trakt']);

    expect(inputs.errors).toEqual([]);
    expect(requested.some((key) => key.startsWith('anilist'))).toBe(false);
    expect(requested.some((key) => key.startsWith('letterboxd'))).toBe(false);
  });

  test('the AniList leg is the CURRENT ∪ PLANNING slice of the already-cached read', async () => {
    const { client, requested } = fakeClient({
      anime: [
        plannedAnime(1),
        { ...plannedAnime(2), status: 'CURRENT' },
      ],
    });

    const inputs = await fetchWatchlistInputs(client, ['anilist']);

    // Plan 0035 R1: an anime you are watching is watchlisted. Both rows come
    // through, each stamped with the status the picker warns off (R3).
    expect(inputs.inputs).toEqual([
      {
        item: expect.objectContaining({ id: 'anilist-1' }),
        source: 'anilist',
        anilistStatus: 'PLANNING',
        entryId: 5001,
      },
      {
        item: expect.objectContaining({ id: 'anilist-2' }),
        source: 'anilist',
        anilistStatus: 'CURRENT',
        entryId: 5002,
      },
    ]);
    // Zero extra requests: one cached list read, no per-status query of its own.
    expect(requested).toEqual(['anilist/current-anime-entries']);
  });

  test('the Letterboxd leg reads every loaded page, not just page 1', async () => {
    const { client } = fakeClient({
      letterboxdPages: [
        [film('letterboxd-a', 'A', 2001)],
        [film('letterboxd-b', 'B', 2002), film('letterboxd-c', 'C', 2003)],
      ],
    });

    const inputs = await fetchWatchlistInputs(client, ['letterboxd']);

    // Reading only the page-1 key would truncate a 600-film watchlist to 28 and
    // make every page-2 film duplicate its Trakt twin instead of merging (R26).
    expect(inputs.inputs.map((input) => input.item.id)).toEqual([
      'letterboxd-a',
      'letterboxd-b',
      'letterboxd-c',
    ]);
    expect(inputs.inputs.every((input) => input.source === 'letterboxd')).toBe(true);
  });

  test('one leg failing keeps the others’ rows and names the provider', async () => {
    const { client } = fakeClient({
      trakt: [traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z')],
      letterboxdPages: [[film('letterboxd-a', 'A', 2001)]],
      failing: ['anilist'],
    });

    const inputs = await fetchWatchlistInputs(client, [
      'trakt',
      'anilist',
      'letterboxd',
    ]);

    expect(inputs.inputs.map((input) => input.source)).toEqual([
      'trakt',
      'letterboxd',
    ]);
    expect(inputs.errors).toEqual([
      { provider: 'anilist', message: 'anilist down' },
    ]);
  });

  test('the Simkl leg stamps its source and addedAt, one call across every bucket', async () => {
    const { client, requested } = fakeClient({
      simkl: [simklEntry(1, 'Cowboy Bebop', '2026-07-05T00:00:00.000Z')],
    });

    const inputs = await fetchWatchlistInputs(client, ['simkl']);

    expect(inputs.inputs).toEqual([
      {
        item: expect.objectContaining({ id: 'simkl-1' }),
        source: 'simkl',
        addedAt: '2026-07-05T00:00:00.000Z',
        // The removal's destructive-warning hint (plan 0036) — stamped on every
        // row, zero included, so "nothing to lose" is stated not inferred.
        simklWatchedCount: 0,
      },
    ]);
    expect(inputs.errors).toEqual([]);
    // One `status=plantowatch` snapshot, not a per-type loop (plan 0034 U7).
    expect(requested).toEqual(['simkl/all-items/all/plantowatch']);
  });

  test('a Simkl plantowatch item merges with its Trakt twin by TMDB id', async () => {
    const heat = traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z');
    const { client } = fakeClient({
      trakt: [heat],
      // Same tmdb id as `traktFilm(1, ...)` — `900 + 1`.
      simkl: [simklEntry(1, 'Heat', '2026-07-06T00:00:00.000Z')],
    });

    const inputs = await fetchWatchlistInputs(client, ['trakt', 'simkl']);
    const entries = computeWatchlist(inputs.inputs);

    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual(['trakt', 'simkl']);
    // The most recent statement wins the sort key (KTD-11) — Simkl's is later.
    expect(entries[0].addedAt).toBe('2026-07-06T00:00:00.000Z');
  });

  test('a failing Simkl leg keeps the other legs’ rows and names the provider', async () => {
    const { client } = fakeClient({
      trakt: [traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z')],
      failing: ['simkl'],
    });

    const inputs = await fetchWatchlistInputs(client, ['trakt', 'simkl']);

    expect(inputs.inputs.map((input) => input.source)).toEqual(['trakt']);
    expect(inputs.errors).toEqual([{ provider: 'simkl', message: 'simkl down' }]);
  });

  test('a page-2 Letterboxd film merges with its Trakt twin end to end', async () => {
    const heat = { ...traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z'), year: 1995 };
    const { client } = fakeClient({
      trakt: [heat],
      letterboxdPages: [
        [film('letterboxd-a', 'A', 2001)],
        [film('letterboxd-heat', 'Heat', 1995)],
      ],
    });

    const inputs = await fetchWatchlistInputs(client, ['trakt', 'letterboxd']);
    const entries = computeWatchlist(inputs.inputs);

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.id === 'trakt-1')?.sources).toEqual([
      'trakt',
      'letterboxd',
    ]);
  });

  test('the gather is never a Calendar source (R22): it returns plain rows', async () => {
    const { client } = fakeClient({
      trakt: [traktFilm(1, 'Heat', '2026-07-01T00:00:00.000Z')],
    });

    const inputs = await fetchWatchlistInputs(client, ['trakt']);

    expect(Object.keys(inputs).sort()).toEqual([
      'errors',
      'incomplete',
      'inputs',
    ]);
    expect(inputs.inputs[0]).not.toHaveProperty('kind');
  });

  test('a full last Letterboxd page marks the leg incomplete (R35)', async () => {
    // 28 films is exactly `WATCHLIST_PAGE_SIZE`, so `getNextPageParam` handed
    // out another cursor: there are films this gather has not seen, and a film
    // missing from `sources` is not evidence it is off the Letterboxd list.
    const fullPage = Array.from({ length: 28 }, (_, index) =>
      film(`lb-${index}`, `Film ${index}`, 2020),
    );
    const { client } = fakeClient({ letterboxdPages: [fullPage] });

    const inputs = await fetchWatchlistInputs(client, ['letterboxd']);

    expect(inputs.incomplete).toEqual(['letterboxd']);
  });

  test('a short last page means the whole list was read', async () => {
    const { client } = fakeClient({
      letterboxdPages: [[film('lb-1', 'Heat', 1995)]],
    });

    const inputs = await fetchWatchlistInputs(client, ['letterboxd']);

    expect(inputs.incomplete).toEqual([]);
  });

  test('a failed leg is `errors` only, never also `incomplete`', async () => {
    const { client } = fakeClient({ failing: ['letterboxd'] });

    const inputs = await fetchWatchlistInputs(client, ['letterboxd']);

    expect(inputs.errors.map((failure) => failure.provider)).toEqual(['letterboxd']);
    expect(inputs.incomplete).toEqual([]);
  });
});

describe('watchlistQueryKeys', () => {
  test('`all` is a prefix of `inputs()` — the disconnect purge depends on it', () => {
    const inputs = watchlistQueryKeys.inputs();
    expect(inputs.slice(0, watchlistQueryKeys.all.length)).toEqual(
      watchlistQueryKeys.all,
    );
  });

  test('disconnecting a provider empties the merged surface only via the shared root', async () => {
    const { QueryClient } = await import('@tanstack/react-query');
    const client = new QueryClient();
    client.setQueryData(watchlistQueryKeys.inputs(), { inputs: [], errors: [] });

    // The reason `state/session` needs an explicit exception at all: this entry
    // holds every provider's rows under a key that names none of them, so the
    // per-provider purge cannot reach it.
    client.removeQueries({ queryKey: ['trakt'] });
    expect(client.getQueryData(watchlistQueryKeys.inputs())).toBeDefined();

    client.removeQueries({ queryKey: [...watchlistQueryKeys.all] });
    expect(client.getQueryData(watchlistQueryKeys.inputs())).toBeUndefined();
  });
});

describe('watchlistReadProviders (plan 0031 R25/R32)', () => {
  test('a Trakt-only user contributes a watchlist read — the row\'s new mount gate', () => {
    // Today they see no watchlist row at all; the gate was a Letterboxd
    // username.
    expect(watchlistReadProviders(['trakt'])).toEqual(['trakt']);
    expect(watchlistReadProviders(['anilist'])).toEqual(['anilist']);
  });

  test('Serializd contributes nothing until its read lands (R32)', () => {
    expect(watchlistReadProviders(['serializd'])).toEqual([]);
  });

  test('Simkl contributes a watchlist read — U3’s live-verified shape (plan 0034 U7)', () => {
    expect(watchlistReadProviders(['simkl'])).toEqual(['simkl']);
  });

  test('no connected provider means no row', () => {
    expect(watchlistReadProviders([])).toEqual([]);
  });
});

describe('refreshWatchlistInputs', () => {
  test('marks every leg stale before refetching the gather', async () => {
    const calls: string[] = [];
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        calls.push(`invalidate:${queryKey.join('/')}`);
        return Promise.resolve();
      },
      refetchQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        calls.push(`refetch:${queryKey.join('/')}`);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    await refreshWatchlistInputs(client);

    // Refetching the gather alone would re-serve the same provider payloads:
    // every leg is read under a 15-minute staleTime, so pull-to-refresh would
    // silently change nothing.
    expect(calls).toEqual([
      'invalidate:trakt/watchlist',
      'invalidate:anilist/current-anime-entries',
      'invalidate:simkl/all-items',
      'invalidate:letterboxd/watchlist-pages/gian',
      'refetch:watchlist/inputs',
    ]);
  });
});
