import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';

import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
import type { TraktShowProgressResult } from '@/lib/providers/trakt/normalize';
import type { NormalizedMediaItem } from '@/types/media';

// Import-time stubs only: MMKV, the native fetch client and react-native's
// entry point don't load under bun. Nothing the slot *does* is mocked — the
// provider seam is the query client itself (see `fakeClient`), which keeps
// these module mocks from leaking real behavior into other suites.
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

const { fetchUpNextInputs, upNextQueryKeys } = await import('./up-next');

function show(traktId: number, lastUpdated: string): NormalizedMediaItem {
  return {
    id: `trakt-${traktId}`,
    title: `Show ${traktId}`,
    coverImage: '',
    type: 'TV',
    currentProgress: 1,
    progressUnit: 'episode',
    lastUpdated,
    externalIds: { trakt: traktId },
  };
}

function animeEntry(anilistId: number): AniListCurrentEntry {
  return {
    item: {
      id: `anilist-${anilistId}`,
      title: `Anime ${anilistId}`,
      coverImage: '',
      type: 'ANIME',
      currentProgress: 3,
      progressUnit: 'episode',
      lastUpdated: '2026-07-21T00:00:00.000Z',
      externalIds: { anilist: anilistId },
    },
    nextAiring: null,
    totalEpisodes: 12,
  };
}

const PROGRESS: TraktShowProgressResult = {
  watchedKeys: new Set<string>(),
  nextEpisode: { season: 1, number: 2, firstAired: '2026-07-22T00:00:00.000Z' },
};

interface Scenario {
  shows?: NormalizedMediaItem[];
  anime?: AniListCurrentEntry[];
  /** Providers whose top-level read rejects. */
  failing?: Array<'trakt' | 'anilist'>;
  /** Trakt ids whose per-show progress read rejects. */
  failingProgress?: number[];
}

/**
 * Every provider read reaches the network through `queryClient.fetchQuery`, so
 * a client that answers by query key is the whole seam — no module mocking, and
 * each cached read is observable (that is how the pool cap is asserted).
 */
function fakeClient(scenario: Scenario) {
  const progressRequests: number[] = [];
  const fetchQuery = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [root, kind, id] = queryKey as [string, string, number];
    if (root === 'trakt' && kind === 'watched-shows') {
      if (scenario.failing?.includes('trakt') === true) {
        throw new Error('watched shows down');
      }
      return scenario.shows ?? [];
    }
    if (root === 'trakt' && kind === 'show-progress') {
      progressRequests.push(id);
      if (scenario.failingProgress?.includes(id) === true) {
        throw new Error(`progress ${id} down`);
      }
      return PROGRESS;
    }
    if (root === 'anilist' && kind === 'current-anime-entries') {
      if (scenario.failing?.includes('anilist') === true) {
        throw new Error('anilist down');
      }
      return scenario.anime ?? [];
    }
    if (root === 'mapping') return null; // ani.zip miss — dedupe is best-effort
    throw new Error(`unexpected query: ${queryKey.join('/')}`);
  };
  return {
    client: { fetchQuery } as unknown as QueryClient,
    progressRequests,
  };
}

describe('fetchUpNextInputs', () => {
  test('Trakt-only: AniList being disconnected is absence, not an error', async () => {
    const { client } = fakeClient({ shows: [show(1, '2026-07-20T00:00:00.000Z')] });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt).toHaveLength(1);
    expect(inputs.trakt[0].nextEpisode?.number).toBe(2);
    expect(inputs.anilist).toEqual([]);
    expect(inputs.errors).toEqual([]);
  });

  test('one show’s progress failing omits that show, not the rest', async () => {
    const { client } = fakeClient({
      shows: [
        show(1, '2026-07-20T00:00:00.000Z'),
        show(2, '2026-07-19T00:00:00.000Z'),
        show(3, '2026-07-18T00:00:00.000Z'),
      ],
      failingProgress: [2],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.trakt.map((input) => input.item.externalIds.trakt)).toEqual([
      1, 3,
    ]);
    // A single failed show is not a slot-level failure.
    expect(inputs.errors).toEqual([]);
  });

  test('the pool caps the per-show request fan (R6/KTD-2)', async () => {
    const { client, progressRequests } = fakeClient({
      shows: Array.from({ length: 25 }, (_, index) =>
        show(
          index + 1,
          `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      ),
    });

    await fetchUpNextInputs(client, ['trakt']);

    expect(progressRequests).toHaveLength(20);
    // Most recently watched first — show 25 is in, show 1 is not.
    expect(progressRequests).toContain(25);
    expect(progressRequests).not.toContain(1);
  });

  test('a failed provider surfaces as an error while the other still returns', async () => {
    const { client } = fakeClient({
      failing: ['trakt'],
      anime: [animeEntry(1)],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.anilist).toHaveLength(1);
    expect(inputs.trakt).toEqual([]);
    expect(inputs.errors).toEqual([
      { provider: 'trakt', message: 'watched shows down' },
    ]);
  });

  test('both providers failing degrades to empty inputs with both errors', async () => {
    const { client } = fakeClient({ failing: ['trakt', 'anilist'] });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.errors.map((error) => error.provider)).toEqual([
      'trakt',
      'anilist',
    ]);
    expect(inputs.trakt).toEqual([]);
    expect(inputs.anilist).toEqual([]);
  });

  test('an unresolvable ani.zip mapping leaves the entry without a TMDB id', async () => {
    const { client } = fakeClient({ shows: [], anime: [animeEntry(7)] });

    const inputs = await fetchUpNextInputs(client, ['trakt', 'anilist']);

    expect(inputs.anilist).toHaveLength(1);
    expect(inputs.anilist[0].tmdbId).toBeUndefined();
  });

  test('no read-capable provider connected → empty inputs, no requests', async () => {
    const { client, progressRequests } = fakeClient({});

    const inputs = await fetchUpNextInputs(client, []);

    expect(inputs).toEqual({ trakt: [], anilist: [], errors: [] });
    expect(progressRequests).toHaveLength(0);
  });
});

describe('upNextQueryKeys', () => {
  test('every key is rooted at "up-next"', () => {
    expect(upNextQueryKeys.all[0]).toBe('up-next');
    expect(upNextQueryKeys.inputs()[0]).toBe('up-next');
  });
});
