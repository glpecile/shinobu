import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistWriteDeps } from './use-watchlist-media';

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

const { runWatchlistWrite } = await import('./use-watchlist-media');

const adapterCalls: ProviderId[] = [];
const refreshCalls: unknown[] = [];

function fakeDeps(): WatchlistWriteDeps {
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
      serializd: () => {
        adapterCalls.push('serializd');
        return Promise.resolve({ status: 'ok' as const });
      },
      simkl: () => {
        adapterCalls.push('simkl');
        return Promise.resolve({ status: 'ok' as const });
      },
    },
    refresh: (_client, options) => {
      refreshCalls.push(options);
      return Promise.resolve();
    },
  };
}

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

function animeFilm(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id: 'anilist-437',
    title: 'Perfect Blue',
    coverImage: '',
    type: 'ANIME',
    isFilm: true,
    year: 1997,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-27T00:00:00.000Z',
    externalIds: { anilist: 437, trakt: 51, tmdb: 10494 },
    ...overrides,
  };
}

function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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
  refreshCalls.length = 0;
  process.env.EXPO_OS = 'ios';
});

describe('runWatchlistWrite — the fan-out contract', () => {
  test('a manual target never enters the adapter map, and rides back as a manual row', async () => {
    process.env.EXPO_OS = 'web';
    const { client } = recordingClient();
    const result = await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());

    expect(adapterCalls).toEqual(['trakt', 'anilist']);
    expect(result.manual).toEqual(['letterboxd']);
  });

  test('an item no connected provider applies to throws rather than silently no-oping', async () => {
    const { client } = recordingClient();
    const manga: NormalizedMediaItem = {
      ...animeFilm(),
      type: 'MANGA',
      isFilm: false,
      externalIds: {},
    };
    await expect(
      runWatchlistWrite(client, manga, ['trakt', 'serializd'], {}, fakeDeps()),
    ).rejects.toThrow(/No connected provider can watchlist/);
  });
});

describe('runWatchlistWrite — agenda coherence (R19/R20)', () => {
  test('a released 1997 film invalidates, but issues no notification regather', async () => {
    const { client, keys } = recordingClient();
    const result = await runWatchlistWrite(
      client,
      animeFilm({
        releaseDate: '1997-08-05',
        releaseCalendar: { theatrical: '1997-08-05' },
      }),
      CONNECTED,
      {},
      fakeDeps(),
    );

    expect(result.succeeded).toEqual(['trakt', 'anilist', 'letterboxd']);
    expect(keys).toContain('trakt/my-calendar');
    expect(keys).toContain('anilist/current-anime-entries');
    expect(keys).toContain('up-next/inputs');
    expect(refreshCalls).toEqual([]);
  });

  test('a film whose digital release is three days out does, with throttle off', async () => {
    const { client } = recordingClient();
    await runWatchlistWrite(
      client,
      animeFilm({
        releaseDate: '2026-05-01',
        releaseCalendar: { theatrical: '2026-05-01', digital: localDate(3) },
      }),
      CONNECTED,
      {},
      fakeDeps(),
    );

    expect(refreshCalls).toEqual([{ throttle: false }]);
  });
});
