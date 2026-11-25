import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { WatchlistEntry, WatchlistInput } from '@/features/watchlist/types';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistRemoveDeps } from './use-unwatchlist-media';

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
  Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
}));
mock.module('@/lib/http/client', () => ({
  httpFetch: async () => new Response('{}'),
}));
mock.module('@/lib/providers/serializd/transport', () => ({
  serializdFetch: async () => new Response('{}'),
  serializdBaseUrl: 'https://api.test',
}));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
mock.module('@/state/queries/mapping', () => ({
  cachedAniZipIds: () => Promise.resolve(null),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedAniListIdByTitle: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  cachedTmdbMovieIdByTitle: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: () => Promise.resolve(null),
  cachedSeasonLayout: () => Promise.resolve(null),
  cachedAniListPrequel: () => Promise.resolve(null),
  cachedSimklAnimeIds: () => Promise.resolve(null),
  cachedTmdbAnimeMatch: () => Promise.resolve(null),
  cachedAniListLaterCours: () => Promise.resolve([]),
  cachedTmdbTvIdByTvdb: () => Promise.resolve(null),
}));

const { runWatchlistRemove, WATCHLIST_REMOVE_ADAPTERS } = await import(
  './use-unwatchlist-media'
);

const adapterCalls: ProviderId[] = [];

function fakeDeps(): WatchlistRemoveDeps {
  return {
    adapters: {
      trakt: () => {
        adapterCalls.push('trakt');
        return Promise.resolve({ status: 'ok' as const });
      },
      anilist: () => {
        adapterCalls.push('anilist');
        return Promise.resolve({ status: 'ok' as const });
      },
      letterboxd: () => {
        adapterCalls.push('letterboxd');
        return Promise.resolve({ status: 'ok' as const });
      },
    },
    refresh: () => Promise.resolve(),
  };
}

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

function series(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id: 'trakt-9',
    title: 'A Show',
    coverImage: '',
    type: 'TV',
    year: 2019,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { trakt: 9, tmdb: 99 },
    ...overrides,
  };
}

function film(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return series({
    id: 'trakt-1',
    title: 'A Film',
    type: 'MOVIE',
    year: 1997,
    externalIds: { trakt: 1, tmdb: 77, letterboxd: 'a-film' },
    ...overrides,
  });
}

function entryFor(item: NormalizedMediaItem, sources: ProviderId[]): WatchlistEntry {
  return { id: item.id, item, sources, sourceIds: [item.id] };
}

function recordingClient(): { client: QueryClient; keys: string[] } {
  const client = new QueryClient();
  const keys: string[] = [];
  client.invalidateQueries = (({ queryKey }: { queryKey: readonly unknown[] }) => {
    keys.push(queryKey.join('/'));
    return Promise.resolve();
  }) as unknown as QueryClient['invalidateQueries'];
  return { client, keys };
}

beforeEach(() => {
  adapterCalls.length = 0;
  process.env.EXPO_OS = 'ios';
});

describe('runWatchlistRemove — the write follows `sources` (R35)', () => {
  test('an entry sourced only from Trakt writes only to Trakt, with all four connected', async () => {
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(series(), ['trakt']),
      CONNECTED,
      [],
      {},
      fakeDeps(),
    );

    expect(adapterCalls).toEqual(['trakt']);
    expect(result.succeeded).toEqual(['trakt']);
    expect(result.unknown).toEqual(['serializd']);
  });

  test('a manual-or-unknown-only plan is the deep-link affordance, never a throw', async () => {
    process.env.EXPO_OS = 'web';
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(film(), ['letterboxd']),
      ['letterboxd'],
      [],
      {},
      fakeDeps(),
    );
    expect(result.outcomes).toEqual([]);
    expect(result.manual).toEqual(['letterboxd']);
  });

  test('an entry no connected provider can act on at all throws rather than no-oping', async () => {
    const { client } = recordingClient();
    const manga = film({ id: 'anilist-5', type: 'MANGA', externalIds: {} });
    await expect(
      runWatchlistRemove(client, entryFor(manga, []), ['trakt'], [], {}, fakeDeps()),
    ).rejects.toThrow(/No connected provider can remove/);
  });
});

describe('the adapter map (R32/R37)', () => {
  test('an item with no AniList id is a reasoned skip, never a request', async () => {
    const adapter = WATCHLIST_REMOVE_ADAPTERS.anilist;
    expect(adapter).toBeDefined();
    expect(await adapter?.({ item: film({ externalIds: { trakt: 1 } }) })).toEqual({
      status: 'skipped',
      reason: 'has no AniList id to remove by',
    });
  });
});

describe('runWatchlistRemove — invalidation, and no optimistic patch (KTD-5)', () => {
  test('the gathered rows are untouched, and the gather is invalidated', async () => {
    const { client, keys } = recordingClient();
    const item = film();
    const inputs: WatchlistInput[] = [
      { item, source: 'trakt', addedAt: '2026-07-01T00:00:00.000Z' },
      { item: series(), source: 'trakt' },
    ];
    const { watchlistQueryKeys } = await import('@/state/queries/watchlist');
    client.setQueryData(watchlistQueryKeys.inputs(), { inputs, errors: [] });

    await runWatchlistRemove(
      client,
      entryFor(item, ['trakt']),
      ['trakt'],
      [],
      {},
      fakeDeps(),
    );

    const cached = client.getQueryData<{ inputs: WatchlistInput[] }>(
      watchlistQueryKeys.inputs(),
    );
    expect(cached?.inputs).toHaveLength(2);
    expect(keys).toContain('watchlist/inputs');
  });
});
