import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { WatchlistRemoveDeps } from '@/features/watchlist-media/use-unwatchlist-media';
import type { WatchlistInputs } from '@/features/watchlist/types';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/** Same isolation preamble as `use-unwatchlist-media.test.ts` — the helper
 * runs the real removal pipeline, whose enrichment touches these modules. */
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
mock.module('@/state/queries/mapping', () => ({
  cachedAniZipIds: () => Promise.resolve(null),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  cachedTmdbMovieIdByTitle: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: () => Promise.resolve(null),
  cachedSeasonLayout: () => Promise.resolve(null),
}));

const { removeWatchedFromWatchlist } = await import('./remove-watched-from-watchlist');
const { watchlistQueryKeys } = await import('@/state/queries/watchlist');

const adapterCalls: ProviderId[] = [];
let letterboxdFails: string | null = null;

function fakeDeps(): WatchlistRemoveDeps {
  return {
    adapters: {
      trakt: () => {
        adapterCalls.push('trakt');
        return Promise.resolve({ status: 'ok' as const });
      },
      letterboxd: () => {
        adapterCalls.push('letterboxd');
        return letterboxdFails == null
          ? Promise.resolve({ status: 'ok' as const })
          : Promise.reject(new Error(letterboxdFails));
      },
      // Bait, not a live adapter (plan 0034 U6): Simkl's remove is 'manual',
      // so routing must never reach this key — the test below pins it.
      simkl: () => {
        adapterCalls.push('simkl');
        return Promise.resolve({ status: 'ok' as const });
      },
    },
    refresh: () => Promise.resolve(),
  };
}

function film(overrides: Partial<NormalizedMediaItem> = {}): NormalizedMediaItem {
  return {
    id: 'trakt-1',
    title: 'A Film',
    coverImage: '',
    type: 'MOVIE',
    year: 1997,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-30T00:00:00.000Z',
    externalIds: { trakt: 1, tmdb: 77, letterboxd: 'a-film' },
    ...overrides,
  };
}

function client(gathered?: WatchlistInputs): QueryClient {
  const queryClient = new QueryClient();
  queryClient.invalidateQueries = (() =>
    Promise.resolve()) as QueryClient['invalidateQueries'];
  if (gathered != null) {
    queryClient.setQueryData(watchlistQueryKeys.inputs(), gathered);
  }
  return queryClient;
}

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

beforeEach(() => {
  adapterCalls.length = 0;
  letterboxdFails = null;
  process.env.EXPO_OS = 'ios';
});

describe('removeWatchedFromWatchlist (plan 0033 U7)', () => {
  test('a watched film is removed from every watchlist holding it', async () => {
    const queryClient = client({
      inputs: [
        { item: film(), source: 'trakt' },
        {
          item: film({ id: 'letterboxd-a-film', externalIds: { letterboxd: 'a-film' } }),
          source: 'letterboxd',
        },
      ],
      errors: [],
      incomplete: [],
    });

    await removeWatchedFromWatchlist(queryClient, film(), CONNECTED, fakeDeps());
    expect(adapterCalls.sort()).toEqual(['letterboxd', 'trakt']);
  });

  test('a TV log never touches the watchlist — shows are removed manually', async () => {
    const show = film({ type: 'TV', externalIds: { trakt: 9, tmdb: 99 } });
    const queryClient = client({
      inputs: [{ item: show, source: 'trakt' }],
      errors: [],
      incomplete: [],
    });

    await removeWatchedFromWatchlist(queryClient, show, CONNECTED, fakeDeps());
    expect(adapterCalls).toEqual([]);
  });

  test('an anime film routes as a film', async () => {
    const animeFilm = film({
      id: 'anilist-437',
      type: 'ANIME',
      isFilm: true,
      externalIds: { anilist: 437, tmdb: 77 },
    });
    const queryClient = client({
      inputs: [{ item: film(), source: 'trakt' }],
      errors: [],
      incomplete: [],
    });

    await removeWatchedFromWatchlist(queryClient, animeFilm, CONNECTED, fakeDeps());
    expect(adapterCalls).toEqual(['trakt']);
  });

  test('a cold gathered cache is a no-op, never a fetch', async () => {
    await removeWatchedFromWatchlist(client(), film(), CONNECTED, fakeDeps());
    expect(adapterCalls).toEqual([]);
  });

  test('a film on no watchlist is a no-op', async () => {
    const queryClient = client({
      inputs: [
        {
          item: film({ id: 'trakt-2', title: 'Another', externalIds: { tmdb: 99 } }),
          source: 'trakt',
        },
      ],
      errors: [],
      incomplete: [],
    });

    await removeWatchedFromWatchlist(queryClient, film(), CONNECTED, fakeDeps());
    expect(adapterCalls).toEqual([]);
  });

  test('the derived removal never routes a second Simkl POST (plan 0034 U6)', async () => {
    const queryClient = client({
      inputs: [{ item: film(), source: 'trakt' }],
      errors: [],
      incomplete: [],
    });

    await removeWatchedFromWatchlist(
      queryClient,
      film(),
      [...CONNECTED, 'simkl'],
      fakeDeps(),
    );
    // A film log with Simkl connected just fired one Simkl history POST inside
    // its ~20s per-user write lock (KTD-3). Simkl's `watchlistRemove` is
    // 'manual' (U4's live-probe gate), so this derived write routes it to the
    // manual/unknown buckets — never to an adapter — and the lock stays
    // uncontended. If the remove flip ever lands, this pin forces the flip to
    // deal with the lock collision explicitly rather than inherit it.
    expect(adapterCalls).toEqual(['trakt']);
  });

  test('a failed removal resolves silently — best-effort by contract', async () => {
    letterboxdFails = 'session expired';
    const queryClient = client({
      inputs: [
        {
          item: film({ id: 'letterboxd-a-film', externalIds: { letterboxd: 'a-film' } }),
          source: 'letterboxd',
        },
      ],
      errors: [],
      incomplete: [],
    });

    await expect(
      removeWatchedFromWatchlist(queryClient, film(), CONNECTED, fakeDeps()),
    ).resolves.toBeUndefined();
    expect(adapterCalls).toEqual(['letterboxd']);
  });
});
