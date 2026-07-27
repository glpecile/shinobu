import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { LogAdapter, LogMediaVariables } from './fan-out';

/**
 * The plan 0027 chain end to end at the decision layer: enrich → translate →
 * route → reconcile → the exact variables each adapter sees. Seams faked the
 * way `enrich.test.ts` does — `state/queries/mapping` owns the provider deps
 * (MMKV tokens, the native fetch client) that don't load under bun, so faking
 * it keeps this a test of *which numbers reach which provider*.
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

let episodeMap: AniZipEpisodeMap | null = null;
const mappingCalls: string[] = [];

mock.module('@/state/queries/mapping', () => ({
  // Enrichment already has every id it needs on these fixtures.
  cachedAniZipIds: () => Promise.resolve(null),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: (_client: unknown, anilistId: number) => {
    mappingCalls.push(`episode-map:${anilistId}`);
    return Promise.resolve(episodeMap);
  },
}));

const { planLogWrite, withMappingSkips } = await import('./use-log-media');
const { fanOutLog } = await import('./fan-out');
const { manualLinkForOutcome, splitSkippedOutcomes } = await import(
  './manual-log-links'
);
const { traktQueryKeys } = await import('@/state/queries/trakt');
const { anilistQueryKeys } = await import('@/state/queries/anilist');

/** Dan Da Dan S2: entry 1..12 → canonical S02E01..12 (real ani.zip shape). */
function sequelMap(): AniZipEpisodeMap {
  return new Map(
    Array.from({ length: 12 }, (_, index) => [
      index + 1,
      { season: 2, number: index + 1 },
    ]),
  );
}

/** A first-season entry: identity mapping, the regression-guard case. */
function seasonOneMap(): AniZipEpisodeMap {
  return new Map(
    Array.from({ length: 12 }, (_, index) => [
      index + 1,
      { season: 1, number: index + 1 },
    ]),
  );
}

function animeSeries(
  overrides: Partial<NormalizedMediaItem> = {},
): NormalizedMediaItem {
  return {
    id: 'anilist-185660',
    title: 'Dan Da Dan Season 2',
    coverImage: '',
    type: 'ANIME',
    currentProgress: 2,
    totalEpisodes: 12,
    progressUnit: 'episode',
    lastUpdated: '2026-07-26T00:00:00.000Z',
    externalIds: { anilist: 185660, trakt: 999, tvdb: 432832, tmdb: 240411 },
    ...overrides,
  };
}

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
}

/** Pre-seed the reconcile reads so nothing reaches the network. */
function seedTrakt(queryClient: QueryClient, traktId: number, keys: string[]) {
  queryClient.setQueryData(traktQueryKeys.showProgress(traktId), {
    watchedKeys: new Set(keys),
  });
}

function seedAniList(
  queryClient: QueryClient,
  mediaId: number,
  entry: { status: string; progress: number } | null,
) {
  queryClient.setQueryData(anilistQueryKeys.entryState(mediaId), {
    episodes: 12,
    entry,
  });
}

/** Records exactly what each adapter was handed, then reports success. */
function recordingAdapters(seen: Map<ProviderId, LogMediaVariables>) {
  const make = (provider: ProviderId): LogAdapter => (variables) => {
    seen.set(provider, variables);
    return Promise.resolve({ status: 'ok' as const });
  };
  return {
    trakt: make('trakt'),
    anilist: make('anilist'),
    serializd: make('serializd'),
    letterboxd: make('letterboxd'),
  };
}

beforeEach(() => {
  episodeMap = sequelMap();
  mappingCalls.length = 0;
  store.clear();
});

describe('planLogWrite — entry → canonical translation (plan 0027 U3)', () => {
  test('a sequel entry writes canonical S2 to Trakt while AniList keeps entry progress', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, []);
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    // AniList is *not* dropped: the old non-season-1 guard only applies to
    // canonical-domain input now (R6/KTD2).
    expect(plan.targets).toEqual(['trakt', 'anilist']);
    expect(plan.mappingSkips.size).toBe(0);
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
    expect(plan.variables.entryEpisodes).toEqual([3]);
    // The caller's fields never survive as their own — one domain each.
    expect(plan.variables.episode).toBeUndefined();

    const seen = new Map<ProviderId, LogMediaVariables>();
    await fanOutLog(recordingAdapters(seen), plan.writeTargets, plan.variables);

    expect(seen.get('trakt')?.episodes).toEqual([{ season: 2, number: 3 }]);
    expect(seen.get('anilist')?.entryEpisodes).toEqual([3]);
  });

  test('Serializd receives the canonical season too', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, []);

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'serializd',
    ]);

    expect(plan.targets).toEqual(['trakt', 'serializd']);
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });

  test('a whole-entry batch translates every episode, all-or-nothing', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, []);
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 0 });

    const plan = await planLogWrite(
      queryClient,
      { item, entryEpisodes: [1, 2, 3] },
      ['trakt', 'anilist'],
    );

    expect(plan.variables.episodes).toEqual([
      { season: 2, number: 1 },
      { season: 2, number: 2 },
      { season: 2, number: 3 },
    ]);
    expect(plan.variables.entryEpisodes).toEqual([1, 2, 3]);
  });

  test('an unmappable entry skips Trakt and Serializd with a reason, AniList still writes', async () => {
    episodeMap = null; // ani.zip down, or no table for this entry yet.
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
      'serializd',
    ]);

    expect([...plan.mappingSkips.keys()]).toEqual(['trakt', 'serializd']);
    // No canonical batch at all — nothing downstream can guess a season.
    expect(plan.variables.episodes).toBeUndefined();
    expect(plan.variables.entryEpisodes).toEqual([3]);

    const seen = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(
      withMappingSkips(recordingAdapters(seen), plan.mappingSkips),
      plan.writeTargets,
      plan.variables,
    );

    // The blocked adapters never ran; their skips carry the reason plan 0022's
    // manual link keys off, and the fan-out did not throw.
    expect(seen.has('trakt')).toBe(false);
    expect(seen.has('serializd')).toBe(false);
    expect(seen.get('anilist')?.entryEpisodes).toEqual([3]);
    expect(result.succeeded).toEqual(['anilist']);
    expect(result.failed).toEqual([]);
    expect(result.outcomes[0]).toMatchObject({ provider: 'trakt', status: 'skipped' });
    expect((result.outcomes[0] as { reason: string }).reason).toBeTruthy();

    // R3 → plan 0022 R6: because the skip carries a reason, it splits out of
    // the "already in sync" copy and earns its own manual deep link.
    const { reconcileSkipped, reasonedSkips } = splitSkippedOutcomes(result.outcomes);
    expect(reconcileSkipped).toEqual([]);
    expect(reasonedSkips.map((skip) => skip.provider)).toEqual(['trakt', 'serializd']);
    for (const skip of reasonedSkips) {
      expect(manualLinkForOutcome(skip, item)).toBeTruthy();
    }
  });

  test('an AniList-only user never fetches the ~1 MB episode map', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'anilist',
    ]);

    expect(mappingCalls).toEqual([]);
    expect(plan.targets).toEqual(['anilist']);
    // No skip outcome for a provider that was never a target (R3).
    expect(plan.mappingSkips.size).toBe(0);
    expect(plan.variables.entryEpisodes).toEqual([3]);
    expect(plan.variables.episodes).toBeUndefined();
  });

  test('a season-1 entry produces the payload it produced before this plan', async () => {
    episodeMap = seasonOneMap();
    const queryClient = client();
    const item = animeSeries({
      id: 'anilist-178025',
      title: 'Gachiakuta',
      externalIds: { anilist: 178025, trakt: 111, tvdb: 450537, tmdb: 241554 },
    });
    seedTrakt(queryClient, 111, []);
    seedAniList(queryClient, 178025, { status: 'CURRENT', progress: 4 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [5] }, [
      'trakt',
      'anilist',
    ]);

    expect(plan.variables.episodes).toEqual([{ season: 1, number: 5 }]);
    expect(plan.variables.entryEpisodes).toEqual([5]);
    expect(plan.mappingSkips.size).toBe(0);
  });

  test('an anime film never attempts translation', async () => {
    const queryClient = client();
    const item = animeSeries({ isFilm: true, totalEpisodes: undefined });

    const plan = await planLogWrite(queryClient, { item }, ['trakt', 'anilist']);

    expect(mappingCalls).toEqual([]);
    expect(plan.variables.episodes).toBeUndefined();
    expect(plan.variables.entryEpisodes).toBeUndefined();
  });

  test('a canonical-domain TV log with an AniList id still drops AniList (R6)', async () => {
    const queryClient = client();
    const item: NormalizedMediaItem = {
      id: 'trakt-42',
      title: 'A Live-Action Show',
      coverImage: '',
      type: 'TV',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: '2026-07-26T00:00:00.000Z',
      externalIds: { trakt: 42, tmdb: 42, anilist: 7 },
    };
    seedTrakt(queryClient, 42, []);

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 2, number: 3 }] },
      ['trakt', 'anilist'],
    );

    expect(plan.targets).toEqual(['trakt']);
    expect(mappingCalls).toEqual([]);
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });
});

describe('planLogWrite — reconcile across both domains (plan 0027 U4)', () => {
  test('season-1 history does not satisfy a canonical season-2 intent', async () => {
    const queryClient = client();
    const item = animeSeries();
    // The user watched S1E3 last year; the intent is S2E3.
    seedTrakt(queryClient, 999, ['1-1', '1-2', '1-3']);
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    // No false in-sync skip: both providers are behind and both get written.
    expect(plan.skipped).toEqual([]);
    expect(plan.writeTargets).toEqual(['trakt', 'anilist']);
    expect(plan.rewatch).toBe(false);
  });

  test('Trakt already at S2E3 with AniList behind → AniList catch-up, Trakt reconcile-skip', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, ['2-1', '2-2', '2-3']);
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    expect(plan.skipped).toEqual(['trakt']);
    expect(plan.writeTargets).toEqual(['anilist']);
    expect(plan.rewatch).toBe(false);
  });

  test('parity on the sequel entry is a rewatch on both', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, ['2-1', '2-2', '2-3']);
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 3 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    expect(plan.skipped).toEqual([]);
    expect(plan.rewatch).toBe(true);
    expect(plan.variables.rewatch).toBe(true);
  });

  test('an unmappable batch with AniList at parity still rewatches AniList alone', async () => {
    episodeMap = null;
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 3 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    // The mapping-skipped provider is excluded from the parity computation —
    // it is neither in sync nor behind. It must not suppress the rewatch, and
    // the rewatch must not imply all-provider parity.
    expect(plan.rewatch).toBe(true);
    expect(plan.skipped).toEqual([]);
    expect(plan.writeTargets).toEqual(['trakt', 'anilist']);
    expect(plan.mappingSkips.has('trakt')).toBe(true);

    const seen = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(
      withMappingSkips(recordingAdapters(seen), plan.mappingSkips),
      plan.writeTargets,
      plan.variables,
    );
    expect(seen.get('anilist')?.rewatch).toBe(true);
    expect(result.succeeded).toEqual(['anilist']);
  });
});
