import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistWriteDeps } from './use-watchlist-media';

/**
 * The watchlist add verb end to end at the function layer (plan 0031 U7).
 * There is no renderer in this suite — `runWatchlistWrite` *is* the behaviour
 * and `useWatchlistMedia` is a `useMutation` wrapper over it.
 */
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
// The Simkl leg (plan 0034 U6) drags `state/queries/simkl` into this module
// graph, whose auth import reaches expo-crypto — mirror the surface it
// consumes instead of loading the whole expo package under bun (the
// `state/queries/simkl.test.ts` pattern).
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));
// Enrichment has every id it needs on these fixtures — no mapping lookups.
mock.module('@/state/queries/mapping', () => ({
  cachedAniZipIds: () => Promise.resolve(null),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  cachedTmdbMovieIdByTitle: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: () => Promise.resolve(null),
  cachedSeasonLayout: () => Promise.resolve(null),
}));

const { runWatchlistWrite } = await import('./use-watchlist-media');

const adapterCalls: ProviderId[] = [];
/** Every notification-refresh call and the options it carried. */
const refreshCalls: unknown[] = [];

/**
 * The seams as fakes. Injected rather than `mock.module`'d: bun's module mocks
 * are process-wide, so faking `@/lib/providers/trakt/writes` here would silently
 * replace the module its own adapter suite is testing.
 */
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

/**
 * An anime *film* — the item that reaches every movie-shaped target at once
 * (Trakt + AniList + Letterboxd writable on native, plan 0033).
 */
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

/** A bare `YYYY-MM-DD` `days` from now, the shape a release calendar carries. */
function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A real client whose invalidations are recorded rather than executed. */
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
    // Letterboxd on *web* is the standing manual case (plan 0033 R7): the
    // declaration is 'write' but `unsupportedWritePlatforms` bans the platform,
    // so it is reported as a manual row — never handed to `runProviderWrites`,
    // whose missing-adapter path is a loud error by design.
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
    await expect(runWatchlistWrite(client, manga, ['trakt', 'serializd'], {}, fakeDeps())).rejects.toThrow(
      /No connected provider can watchlist/,
    );
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
    // It has no instant inside today…today+6, so it cannot produce a
    // notification candidate — a full `fetchUpNextInputs` regather here would
    // be pure cost, and bypassing THROTTLE_MS for it doubly so.
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
