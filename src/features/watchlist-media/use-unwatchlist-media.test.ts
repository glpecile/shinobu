import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { WatchlistEntry, WatchlistInput } from '@/features/watchlist/types';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { WatchlistRemoveDeps } from './use-unwatchlist-media';

/**
 * The removal verb end to end at the function layer (plan 0031 U16). No
 * renderer — `runWatchlistRemove` *is* the behaviour and `useUnwatchlistMedia`
 * is a `useMutation` wrapper over it, exactly as the add is split.
 *
 * **The AniList refusals live with the adapter**, not here: `deleteAniListEntry`
 * guards on a *fresh* in-effect read (R36) — bare `PLANNING`/`progress: 0`
 * deletes by that read's id, `CURRENT` refuses without issuing the mutation, a
 * score/notes/custom list refuses, and a failed guard read fails closed — and
 * `src/lib/providers/anilist/writes.test.ts` asserts every one of them against
 * a recorded request log. Re-asserting them through a fake adapter here would
 * prove nothing about the guard. What this suite owns is everything *around*
 * the adapters: which of them run at all, and what the surface is told.
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

const {
  runWatchlistRemove,
  WATCHLIST_REMOVE_ADAPTERS,
  watchlistRemoveMutationKey,
  watchlistRemovePendingFilter,
} = await import('./use-unwatchlist-media');
const { isUnwatchlistCtaSettled, unwatchlistCtaCopy, watchlistResultView } =
  await import('./copy');
const { watchlistMutationKey } = await import('./use-watchlist-media');
const { computeWatchlist } = await import('@/features/watchlist/compute');
const { PROVIDERS } = await import('@/lib/providers/registry');

/** Per-provider adapter behaviour, swapped per test. */
let traktFails: string | null = null;
let traktSkips: string | null = null;
const adapterCalls: ProviderId[] = [];
const refreshCalls: unknown[] = [];

/**
 * The seams as fakes, injected rather than `mock.module`'d: bun's module mocks
 * are process-wide, so faking `@/lib/providers/trakt/writes` here would silently
 * replace the module its own adapter suite is testing.
 */
function fakeDeps(): WatchlistRemoveDeps {
  return {
    adapters: {
      trakt: () => {
        adapterCalls.push('trakt');
        if (traktFails != null) return Promise.reject(new Error(traktFails));
        return Promise.resolve(
          traktSkips == null
            ? { status: 'ok' as const }
            : { status: 'skipped' as const, reason: traktSkips },
        );
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
    refresh: (_client, options) => {
      refreshCalls.push(options);
      return Promise.resolve();
    },
  };
}

const CONNECTED: ProviderId[] = ['trakt', 'anilist', 'letterboxd', 'serializd'];

/** Placeholder for a resolver captured out of a Promise executor. */
const NOOP = () => {};

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
  traktSkips = null;
  adapterCalls.length = 0;
  refreshCalls.length = 0;
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
    // ...and Serializd, connected and applicable to a TV item but with no read
    // leg in v1, is an upfront manual row rather than a silent drop.
    expect(result.unknown).toEqual(['serializd']);
  });

  test('the settled "Removed" label is withheld while any membership was unknown', async () => {
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(series(), ['trakt']),
      CONNECTED,
      [],
      {},
      fakeDeps(),
    );
    const view = watchlistResultView(result, series());

    // Every write succeeded and the refetch has landed (`onList: false`) — and
    // it still does not settle, because Serializd's membership was never known.
    expect(isUnwatchlistCtaSettled(false, view, result.unknown)).toBe(false);
    // Take Serializd out of the picture and the same report settles.
    expect(isUnwatchlistCtaSettled(false, view, [])).toBe(true);
  });

  test('an entry gathered while the Trakt leg errored offers a manual row, not "Removed"', async () => {
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(film(), ['letterboxd']),
      ['trakt', 'letterboxd'],
      [{ provider: 'trakt', message: '502 from Trakt' }],
      {},
      fakeDeps(),
    );

    // No write is fired at a provider whose membership is unknown...
    expect(adapterCalls).toEqual(['letterboxd']);
    expect(result.unknown).toEqual(['trakt']);
    // ...Letterboxd holds it and (plan 0033) removes via the fan-out...
    expect(result.succeeded).toEqual(['letterboxd']);
    // ...and the label stays actionable rather than claiming a removal that
    // may not have happened on Trakt.
    expect(isUnwatchlistCtaSettled(false, watchlistResultView(result, film()), result.unknown)).toBe(
      false,
    );
  });

  test('a manual-or-unknown-only plan is the deep-link affordance, never a throw', async () => {
    // Letterboxd on web is the standing manual case (plan 0033 R7): the
    // declaration is 'write' but the platform bans it.
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

describe('runWatchlistRemove — the three result families (R38)', () => {
  test("Trakt's `deleted: 0` reaches the surface as a reasoned skip with its own link", async () => {
    traktSkips = 'was not on your watchlist';
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(film(), ['trakt']),
      ['trakt'],
      [],
      {},
      fakeDeps(),
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    const view = watchlistResultView(result, film());
    expect(view.reasonedSkips).toEqual([
      { provider: 'trakt', status: 'skipped', reason: 'was not on your watchlist' },
    ]);
  });

  test('one provider failing leaves the others removed and is named in the report', async () => {
    traktFails = 'Trakt said no';
    const { client } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(film({ type: 'ANIME', isFilm: true, externalIds: { trakt: 1, anilist: 437 } }), [
        'trakt',
        'anilist',
      ]),
      CONNECTED,
      [],
      {},
      fakeDeps(),
    );

    expect(result.succeeded).toEqual(['anilist']);
    expect(result.failed).toEqual(['trakt']);
    const view = watchlistResultView(result, film());
    expect(view.errorLinks.map((link) => link.provider)).toEqual(['trakt']);
    // A failure keeps the CTA actionable even once the cache says it is gone.
    expect(isUnwatchlistCtaSettled(false, view, [])).toBe(false);
  });

  test('the copy names no provider and morphs to "Removed"', () => {
    const copy = unwatchlistCtaCopy(film());
    expect(copy.idle).toBe('Remove from watchlist');
    expect(copy.settled).toBe('Removed');
    expect(copy.pending).toBe('Removing…');
    for (const value of Object.values(copy)) {
      for (const provider of Object.values(PROVIDERS)) {
        expect(value).not.toContain(provider.label);
      }
    }
    // Read-intent items say reading list, the same split the add makes.
    expect(unwatchlistCtaCopy({ type: 'MANGA' }).idle).toBe('Remove from reading list');
  });
});

describe('the adapter map (R32/R37)', () => {
  test('Trakt, AniList and Letterboxd have adapters — Serializd is absent by design', () => {
    expect(Object.keys(WATCHLIST_REMOVE_ADAPTERS).sort()).toEqual([
      'anilist',
      'letterboxd',
      'trakt',
    ]);
    // Serializd's `removeFromSerializdWatchlist` exists (U9) and is deliberately
    // not on a live path in v1: no read leg means it can never appear in a
    // `sources`, so an adapter here would be unreachable code behind a manual
    // declaration. Letterboxd's flipped in plan 0033 (verified state-set endpoint).
    expect(PROVIDERS.serializd.watchlistRemove).toBe('manual');
    expect(PROVIDERS.letterboxd.watchlistRemove).toBe('write');
    // Simkl (plan 0034 U6): the add went 'write' but the remove stays 'manual'
    // behind U4's live-probe gate — `/sync/history/remove`'s whole-item body
    // removes watch history along with the list entry, so until the probe
    // clears it Simkl renders as a manual deep-link row here, never an adapter.
    expect(PROVIDERS.simkl.watchlistWrite).toBe('write');
    expect(PROVIDERS.simkl.watchlistRemove).toBe('manual');
  });

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
  test('the same key list the add invalidates, gatherer last', async () => {
    const { client, keys } = recordingClient();
    await runWatchlistRemove(
      client,
      entryFor(film(), ['trakt']),
      ['trakt'],
      [],
      {},
      fakeDeps(),
    );

    expect(keys).toContain('trakt/my-calendar');
    expect(keys).toContain('trakt/watchlist');
    expect(keys).toContain('up-next/inputs');
    expect(keys).toContain('watchlist/inputs');
  });

  test('the gathered rows are untouched until the refetch lands, and then the row is gone', async () => {
    const { client } = recordingClient();
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

    // No optimistic patch: the write leaves the cache exactly as it found it,
    // so a failed removal never has to be un-patched out of a list the user is
    // looking at. The row leaves the grid only when the invalidation above
    // brings back a gather without it.
    const cached = client.getQueryData<{ inputs: WatchlistInput[] }>(
      watchlistQueryKeys.inputs(),
    );
    expect(cached?.inputs).toHaveLength(2);
    expect(computeWatchlist(cached?.inputs ?? []).map((entry) => entry.id)).toContain(
      item.id,
    );
    expect(
      computeWatchlist(inputs.filter((input) => input.item.id !== item.id)).map(
        (entry) => entry.id,
      ),
    ).not.toContain(item.id);
  });

  test('a removal that reached no provider invalidates nothing', async () => {
    traktFails = 'nope';
    const { client, keys } = recordingClient();
    const result = await runWatchlistRemove(
      client,
      entryFor(film(), ['trakt']),
      ['trakt'],
      [],
      {},
      fakeDeps(),
    );
    expect(result.succeeded).toEqual([]);
    expect(keys).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });
});

describe('useUnwatchlistMedia — the mutation shell (R18/R38)', () => {
  test('invalidation still runs when the sheet unmounts mid-write', async () => {
    const { client, keys } = recordingClient();
    const entry = entryFor(film(), ['trakt']);

    // A mutation built on the cache with **zero observers** is precisely the
    // unmounted case: an `onSuccess` callback would never fire. Invalidation
    // lives in `mutationFn`, so it runs anyway — and this verb unmounts more
    // often than the add, because a successful removal empties the row.
    const mutation = client.getMutationCache().build(client, {
      mutationKey: watchlistRemoveMutationKey(entry.item.id),
      mutationFn: (variables: Record<string, never>) =>
        runWatchlistRemove(client, entry, ['trakt'], [], variables, fakeDeps()),
    });
    await mutation.execute({});

    expect(keys).toContain('watchlist/inputs');
  });

  test('the pending guard is shared across mounts, and separate from the add', async () => {
    const { client } = recordingClient();
    const item = film();
    let release: () => void = NOOP;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const cellMutation = client.getMutationCache().build(client, {
      mutationKey: watchlistRemoveMutationKey(item.id),
      mutationFn: () => blocked,
    });
    const inFlight = cellMutation.execute(undefined);
    while (
      client.getMutationCache().findAll(watchlistRemovePendingFilter(item.id)).length === 0
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // The grid cell and the sheet over it are two mounts reading one shared
    // mutation cache — the whole point of keying on the item (R18).
    expect(
      client.getMutationCache().findAll(watchlistRemovePendingFilter(item.id)).length,
    ).toBe(1);
    // ...and an add of the same item is a different write, not the same one.
    expect(
      client.getMutationCache().findAll({
        mutationKey: watchlistMutationKey(item.id),
        status: 'pending',
      }).length,
    ).toBe(0);

    release();
    await inFlight;
    expect(
      client.getMutationCache().findAll(watchlistRemovePendingFilter(item.id)).length,
    ).toBe(0);
  });
});
