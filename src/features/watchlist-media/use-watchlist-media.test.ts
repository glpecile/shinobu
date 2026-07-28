import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistWriteDeps } from './use-watchlist-media';

/**
 * The watchlist add verb end to end at the function layer (plan 0031 U7).
 * There is no renderer in this suite — `runWatchlistWrite` *is* the behaviour
 * and `useWatchlistMedia` is a `useMutation` wrapper over it, which is what
 * makes the unmount and shared-guard scenarios testable at all.
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

const {
  runWatchlistWrite,
  WATCHLIST_ADAPTERS,
  watchlistMutationKey,
  watchlistPendingFilter,
} = await import('./use-watchlist-media');
const { planWatchlistWrite } = await import('./targets');

/** Per-provider adapter behaviour, swapped per test. */
let traktFails: string | null = null;
let anilistFails: string | null = null;
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
        return traktFails == null
          ? Promise.resolve({ status: 'ok' as const })
          : Promise.reject(new Error(traktFails));
      },
      anilist: () => {
        adapterCalls.push('anilist');
        return anilistFails == null
          ? Promise.resolve({ status: 'ok' as const })
          : Promise.reject(new Error(anilistFails));
      },
    },
    refresh: (_client, options) => {
      refreshCalls.push(options);
      return Promise.resolve();
    },
  };
}

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

/** Placeholder for a resolver captured out of a Promise executor. */
const NOOP = () => {};

/**
 * An anime *film* — the item that reaches every movie-shaped target at once
 * (Trakt + AniList writable, Letterboxd manual), so one fixture covers the
 * routing-order and partial-failure contracts.
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
  traktFails = null;
  anilistFails = null;
  adapterCalls.length = 0;
  refreshCalls.length = 0;
  process.env.EXPO_OS = 'ios';
});

describe('runWatchlistWrite — the fan-out contract', () => {
  test('every writable provider reports ok, in routing order', async () => {
    const { client } = recordingClient();
    const result = await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());

    expect(result.outcomes.map((outcome) => outcome.provider)).toEqual([
      'trakt',
      'anilist',
    ]);
    expect(result.outcomes.every((outcome) => outcome.status === 'ok')).toBe(true);
    expect(result.succeeded).toEqual(['trakt', 'anilist']);
    expect(result.failed).toEqual([]);
  });

  test('one provider failing leaves the others ok and is named in the report', async () => {
    anilistFails = 'AniList said no';
    const { client } = recordingClient();
    const result = await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());

    expect(result.succeeded).toEqual(['trakt']);
    expect(result.failed).toEqual(['anilist']);
    const failure = result.outcomes.find((outcome) => outcome.provider === 'anilist');
    expect(failure?.status).toBe('error');
    expect(failure).toMatchObject({ message: 'AniList said no' });
    // The partial failure is per provider — Trakt's add is not rolled back.
    expect(result.outcomes[0]).toMatchObject({ provider: 'trakt', status: 'ok' });
  });

  test('a manual target never enters the adapter map', async () => {
    const { client } = recordingClient();
    const plan = await planWatchlistWrite(client, animeFilm(), CONNECTED);

    // Letterboxd is applicable (a movie-shaped item) but declares the verb
    // manual, so it is reported as a manual row — never handed to
    // `runProviderWrites`, whose missing-adapter path is a loud error by design.
    expect(plan.manual).toEqual(['letterboxd']);
    expect(plan.targets).toEqual(['trakt', 'anilist']);
    expect(Object.keys(WATCHLIST_ADAPTERS).sort()).toEqual(['anilist', 'trakt']);

    await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());
    expect(adapterCalls).toEqual(['trakt', 'anilist']);
  });

  test('the manual rows ride back on the result for R17 to render', async () => {
    const { client } = recordingClient();
    const result = await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());
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

    expect(result.succeeded).toEqual(['trakt', 'anilist']);
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

  test('never on web, whatever the item states', async () => {
    process.env.EXPO_OS = 'web';
    const { client } = recordingClient();
    await runWatchlistWrite(
      client,
      animeFilm({ releaseCalendar: { digital: localDate(3) } }),
      // Letterboxd is manual on web for the *log* verb too, so this also keeps
      // the routing honest: only Trakt and AniList are written.
      CONNECTED,
      {},
      fakeDeps(),
    );
    expect(refreshCalls).toEqual([]);
  });

  test('a write that reached no provider invalidates nothing and regathers nothing', async () => {
    traktFails = 'nope';
    anilistFails = 'nope';
    const { client, keys } = recordingClient();
    const result = await runWatchlistWrite(client, animeFilm(), CONNECTED, {}, fakeDeps());

    expect(result.succeeded).toEqual([]);
    expect(keys).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });
});

describe('useWatchlistMedia — the mutation shell', () => {
  test('invalidation still runs when the calling component unmounts mid-write', async () => {
    const { client, keys } = recordingClient();
    const item = animeFilm();

    // A mutation built on the cache with **zero observers** is precisely the
    // unmounted case: nothing is subscribed, so an `onSuccess` callback would
    // never fire. Invalidation lives in `mutationFn`, so it runs anyway.
    const mutation = client.getMutationCache().build(client, {
      mutationKey: watchlistMutationKey(item.id),
      mutationFn: (variables: Record<string, never>) =>
        runWatchlistWrite(client, item, CONNECTED, variables, fakeDeps()),
    });
    await mutation.execute({});

    expect(keys).toContain('trakt/my-calendar');
    expect(keys).toContain('up-next/inputs');
  });

  test('the pending guard is shared across mounts of the same item', async () => {
    const { client } = recordingClient();
    const item = animeFilm();
    let release: () => void = NOOP;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Instance A — the card.
    const cardMutation = client.getMutationCache().build(client, {
      mutationKey: watchlistMutationKey(item.id),
      mutationFn: () => blocked,
    });
    const inFlight = cardMutation.execute(undefined);
    // `execute` reaches 'pending' a few microtasks in, not synchronously.
    while (client.getMutationCache().findAll(watchlistPendingFilter(item.id)).length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Instance B — the sheet opened over it, a different mount entirely. It
    // reads the same shared mutation cache, which is the whole point of keying
    // on the item rather than on the component (R18).
    const pending = client.getMutationCache().findAll(watchlistPendingFilter(item.id));
    expect(pending.length).toBe(1);
    // ...and it is scoped to *this* item, not to the verb.
    expect(
      client.getMutationCache().findAll(watchlistPendingFilter('anilist-999')).length,
    ).toBe(0);

    release();
    await inFlight;
    expect(client.getMutationCache().findAll(watchlistPendingFilter(item.id)).length).toBe(
      0,
    );
  });
});
