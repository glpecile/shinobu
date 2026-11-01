import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { AniZipEpisodeMap, AniZipIds } from '@/lib/providers/mapping/anizip';
import type { SeasonLayout } from '@/lib/providers/mapping/season-layout';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

import type { LogMediaVariables, WriteAdapter } from './fan-out';

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
const emptyResponse = async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}');
let httpHandler = emptyResponse;
mock.module('@/lib/http/client', () => ({
  httpFetch: (input: RequestInfo | URL, init?: RequestInit) => httpHandler(input, init),
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

let episodeMap: AniZipEpisodeMap | null = null;
let seasonLayout: SeasonLayout | null = null;
let prequel: { id: number; episodes: number } | null = null;
let prequelIds: AniZipIds | null = null;
let prequelMap: AniZipEpisodeMap | null = null;
let prequelTmdb: number | null = null;
let courIds = new Map<number, AniZipIds>();
let courMaps = new Map<number, AniZipEpisodeMap>();
let laterCours = new Map<number, number[]>();
const mappingCalls: string[] = [];

mock.module('@/state/queries/mapping', () => ({
  // Enrichment already has every id it needs on these fixtures.
  cachedAniZipIds: (_client: unknown, lookup: { anilistId?: number }) =>
    Promise.resolve(courIds.get(lookup.anilistId ?? -1) ?? prequelIds),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  // Unreachable from the log path, but `mock.module` is process-wide and Up
  // Next's Letterboxd release resolve imports it by name.
  cachedTmdbMovieIdByTitle: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: (_client: unknown, anilistId: number) => {
    mappingCalls.push(`episode-map:${anilistId}`);
    return Promise.resolve(courMaps.get(anilistId) ?? (anilistId === prequel?.id ? prequelMap : episodeMap));
  },
  cachedSeasonLayout: (_client: unknown, ids: Record<string, number>) => {
    mappingCalls.push(`season-layout:${JSON.stringify(ids)}`);
    return Promise.resolve(seasonLayout);
  },
  cachedAniListPrequel: () => Promise.resolve(prequel),
  cachedAniListLaterCours: (_client: unknown, anilistId: number) =>
    Promise.resolve(laterCours.get(anilistId) ?? []),
  cachedTmdbTvIdByTvdb: () => Promise.resolve(prequelTmdb),
}));

const {
  invalidateAfterLog,
  logAdapters,
  planLogWrite,
  simklLogAdapter,
  withMappingSkips,
  withUnconfirmed,
} = await import('./use-log-media');
const { fanOutLog } = await import('./fan-out');
const { manualLinkForOutcome, splitSkippedOutcomes } = await import(
  './manual-write-links'
);
const { traktQueryKeys } = await import('@/state/queries/trakt');
const { anilistQueryKeys } = await import('@/state/queries/anilist');

test('a whole-series Letterboxd confirmation reaches only its diary adapter, with no episode payload', async () => {
  const item: NormalizedMediaItem = {
    id: 'letterboxd-beast-boy-lone-wolf', title: 'Beast Boy: Lone Wolf', coverImage: '',
    type: 'MOVIE', tmdbTvVariant: 228880, currentProgress: 0, progressUnit: 'episode',
    lastUpdated: '', externalIds: { letterboxd: 'beast-boy-lone-wolf' },
  };
  const plan = await planLogWrite(client(), { item }, ['simkl', 'trakt', 'anilist', 'serializd', 'letterboxd']);
  const deliveries: LogMediaVariables[] = [];
  const result = await fanOutLog({ letterboxd: async (variables) => { deliveries.push(variables); return { status: 'ok' }; } }, plan.writeTargets, plan.variables);
  expect(result.succeeded).toEqual(['letterboxd']);
  expect(result.outcomes).toEqual([{ provider: 'letterboxd', status: 'ok' }]);
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].item.externalIds).toEqual({ letterboxd: 'beast-boy-lone-wolf' });
  expect(deliveries[0].episodes).toBeUndefined();
  expect(deliveries[0].entryEpisodes).toBeUndefined();
});

test('a Letterboxd film the member page already shows is logged again as a rewatch', async () => {
  const { connectLetterboxd } = await import('@/state/session/letterboxd');
  const { letterboxdFilmWatchQuery } = await import('@/state/queries/letterboxd');
  connectLetterboxd('glptest');
  const item: NormalizedMediaItem = {
    id: 'letterboxd-inception', title: 'Inception', coverImage: '', type: 'MOVIE',
    currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { letterboxd: 'inception' },
  };
  const queryClient = client();
  queryClient.setQueryData(letterboxdFilmWatchQuery('glptest', item).queryKey, { ...item, currentProgress: 1 });
  const plan = await planLogWrite(queryClient, { item }, ['letterboxd']);
  expect(plan.writeTargets).toEqual(['letterboxd']);
  expect(plan.variables.rewatch).toBe(true);
  store.clear();
});

/**
 * Real Dan Da Dan S2 data: ani.zip maps the entry's 1..12 to TVDB S02E01..12,
 * absolute 13..24 — while Trakt *and* TMDB both hold one continuous
 * 24-episode season. So episode 3 of this entry is S01E15 on both trackers,
 * not S02E03 (docs/solutions/anizip-tvdb-seasons-vs-tracker-seasons.md).
 */
function sequelMap(): AniZipEpisodeMap {
  return new Map(
    Array.from({ length: 12 }, (_, index) => [
      index + 1,
      { season: 2, number: index + 1, absolute: index + 13 },
    ]),
  );
}

function tenEpisodes(season: number): AniZipEpisodeMap {
  return new Map(Array.from({ length: 10 }, (_, index) => [index + 1, { season, number: index + 1 }]));
}

const ONE_CONTINUOUS_SEASON: SeasonLayout = [{ season: 1, episodeCount: 24 }];

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
  const make = (provider: ProviderId): WriteAdapter<LogMediaVariables> => (variables) => {
    seen.set(provider, variables);
    return Promise.resolve({ status: 'ok' as const });
  };
  return {
    trakt: make('trakt'),
    anilist: make('anilist'),
    serializd: make('serializd'),
    letterboxd: make('letterboxd'),
    simkl: make('simkl'),
  };
}

beforeEach(() => {
  episodeMap = sequelMap();
  seasonLayout = ONE_CONTINUOUS_SEASON;
  prequel = null;
  prequelIds = null;
  prequelMap = null;
  prequelTmdb = null;
  courIds = new Map();
  courMaps = new Map();
  laterCours = new Map();
  mappingCalls.length = 0;
  store.clear();
  httpHandler = emptyResponse;
});

describe('planLogWrite — entry → canonical translation (plan 0027 U3)', () => {
  test.each([
    { name: 'matching TVDB', tvdb: 432832, tmdb: null, targetTvdb: 432832, maps: true },
    { name: 'matching TVDB-to-TMDB lookup', tvdb: 432832, tmdb: 240411, targetTvdb: undefined, maps: true },
    { name: 'a different show', tvdb: 78857, tmdb: null, targetTvdb: 432832, maps: false },
    { name: 'an unresolved identity', tvdb: undefined, tmdb: null, targetTvdb: undefined, maps: false },
  ])('a missing sequel table borrows its prequel only with $name', async ({ tvdb, tmdb, targetTvdb, maps }) => {
    episodeMap = null;
    prequel = { id: 20, episodes: 12 };
    prequelIds = { tvdb };
    prequelTmdb = tmdb;
    prequelMap = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, {
      season: 1, number: i + 1, absolute: i + 1,
    }]));
    const item = animeSeries({ externalIds: { anilist: 185660, tvdb: targetTvdb, tmdb: 240411 } });
    const plan = await planLogWrite(client(), { item, entryEpisodes: [3] }, ['serializd']);
    expect(plan.variables.episodes).toEqual(maps ? [{ season: 1, number: 15 }] : undefined);
    expect(plan.mappingSkips.has('serializd')).toBe(!maps);
  });

  test('a sequel entry writes the tracker’s own numbering while AniList keeps entry progress', async () => {
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
    // ani.zip says S02E03, but Trakt/TMDB hold one 24-episode season, so the
    // episode the trackers can actually resolve is S01E15 (absolute).
    expect(plan.variables.episodes).toEqual([{ season: 1, number: 15 }]);
    expect(plan.variables.entryEpisodes).toEqual([3]);
    // The caller's fields never survive as their own — one domain each.
    expect(plan.variables.episode).toBeUndefined();

    const seen = new Map<ProviderId, LogMediaVariables>();
    await fanOutLog(recordingAdapters(seen), plan.writeTargets, plan.variables);

    expect(seen.get('trakt')?.episodes).toEqual([{ season: 1, number: 15 }]);
    expect(seen.get('anilist')?.entryEpisodes).toEqual([3]);
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
  test.each(['mapped', 'missing-map', 'missing-mal'] as const)('a later TMDB season resolves its cour safely: %s', async (mapping) => {
    // Real Cyberpunk: Edgerunners data. TMDB 105248 holds both cours as S1 and
    // S2; AniList 120377 is S1 and 195539 (MAL 61990), related as OTHER, is S2.
    courIds = new Map([
      [120377, { anilist: 120377, tvdb: 384541, mal: 42310 }],
      [195539, { anilist: 195539, tvdb: 384541, mal: 61990 }],
    ]);
    courMaps = new Map([[120377, tenEpisodes(1)], [195539, tenEpisodes(2)]]);
    laterCours = new Map([[120377, [195539]]]);
    const item: NormalizedMediaItem = {
      id: 'tmdb-tv-105248', title: 'Cyberpunk: Edgerunners', coverImage: '', type: 'TV',
      currentProgress: 10, progressUnit: 'episode', lastUpdated: '',
      externalIds: { tmdb: 105248, tvdb: 384541, anilist: 120377, simkl: 1 },
    };
    if (mapping === 'missing-map') courMaps.set(195539, new Map());
    if (mapping === 'missing-mal') courIds.set(195539, { anilist: 195539, tvdb: 384541 });
    const queryClient = client();
    seedAniList(queryClient, 195539, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, episodes: [{ season: 2, number: 3 }] }, ['anilist', 'simkl']);

    const deliveries = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(
      withMappingSkips(recordingAdapters(deliveries), plan.mappingSkips),
      plan.writeTargets,
      plan.variables,
    );
    if (mapping !== 'mapped') {
      expect(deliveries.has('simkl')).toBe(false);
      expect(result.outcomes).toContainEqual({
        provider: 'simkl', status: 'skipped',
        reason: 'Could not resolve a cour-specific Simkl identity for these episodes',
      });
      return;
    }
    expect(plan.targets).toEqual(['anilist', 'simkl']);
    expect(plan.variables.item.type).toBe('ANIME');
    expect(plan.variables.item.externalIds).toEqual({ tmdb: 105248, tvdb: 384541, anilist: 195539, mal: 61990 });
    expect(plan.variables.entryEpisodes).toEqual([3]);
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });
});

describe('the Simkl leg of the log fan-out (plan 0034 U6)', () => {
  test('an entry-domain anime log hands Simkl the entry numbers with no map fetch', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    // AniList + Simkl only: no canonical-numbering target, so the R7
    // short-circuit still skips the ~1 MB ani.zip document — Simkl's anime
    // write speaks the entry/AniDB domain natively (KTD-6) and is deliberately
    // NOT in CANONICAL_EPISODE_PROVIDERS.
    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'anilist',
      'simkl',
    ]);

    expect(mappingCalls).toEqual([]);
    expect(plan.targets).toEqual(['anilist', 'simkl']);
    expect(plan.variables.entryEpisodes).toEqual([3]);

    const seen = new Map<ProviderId, LogMediaVariables>();
    await fanOutLog(recordingAdapters(seen), plan.writeTargets, plan.variables);
    expect(seen.get('simkl')?.entryEpisodes).toEqual([3]);
    // The adapter itself resolves no map either: entry-domain input already is
    // the domain Simkl counts by, so `cachedAniZipEpisodeMap` is never asked.
    const entries: unknown[] = [];
    const adapter = simklLogAdapter(queryClient, (entry) => {
      entries.push(entry);
      return Promise.resolve({ status: 'ok' as const });
    });
    await adapter(plan.variables);
    expect(mappingCalls).toEqual([]);
    expect(entries[0]).toMatchObject({ entryEpisodes: [3], episodeMap: null });
  });

  test('a translation miss skips Trakt with a reason while Simkl still writes the entry batch', async () => {
    episodeMap = null; // ani.zip down, or no table for this entry yet.
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
      'simkl',
    ]);

    // Only the canonical-domain providers are mapping-blocked (R3); Simkl's
    // entry-domain write is unaffected by the miss.
    expect([...plan.mappingSkips.keys()]).toEqual(['trakt']);

    const seen = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(
      withMappingSkips(recordingAdapters(seen), plan.mappingSkips),
      plan.writeTargets,
      plan.variables,
    );
    expect(seen.has('trakt')).toBe(false);
    expect(seen.get('simkl')?.entryEpisodes).toEqual([3]);
    expect(result.succeeded).toEqual(['anilist', 'simkl']);
  });

  test('a canonically-numbered anime batch reaches the adapter with the ani.zip table', async () => {
    const queryClient = client();
    const item = animeSeries();

    // Canonical origin (a TMDB-shaped surface): S02E03, not entry episode 3.
    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 2, number: 3 }] },
      ['simkl'],
    );

    // A season-2+ canonical batch has no entry-domain reading — deriving one
    // would hand Simkl "entry episode 3" for an episode that is not (the
    // wrong-identity write plan 0027 bans).
    expect(plan.variables.entryEpisodes).toBeUndefined();
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);

    const entries: Array<{ episodeMap?: unknown }> = [];
    const adapter = simklLogAdapter(queryClient, (entry) => {
      entries.push(entry);
      return Promise.resolve({ status: 'ok' as const });
    });
    await adapter(plan.variables);

    // The adapter fetched the same cached table the forward translation uses
    // and handed it to writes.ts for the reverse map (KTD-6).
    expect(mappingCalls).toEqual(['episode-map:185660']);
    expect(entries[0]).toMatchObject({ episodes: [{ season: 2, number: 3 }] });
    expect(entries[0].episodeMap).toBe(episodeMap);
  });

  test('a season-1 canonical anime batch keeps its entry reading and needs no table', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 1, number: 3 }] },
      ['anilist', 'simkl'],
    );

    // Plan 0011's standing rule: a canonical season-1 batch IS the entry's own
    // numbering, so both entry-domain consumers read it directly.
    expect(plan.variables.entryEpisodes).toEqual([3]);

    const entries: Array<{ episodeMap?: unknown }> = [];
    const adapter = simklLogAdapter(queryClient, (entry) => {
      entries.push(entry);
      return Promise.resolve({ status: 'ok' as const });
    });
    await adapter(plan.variables);
    expect(mappingCalls).toEqual([]);
    expect(entries[0]).toMatchObject({ entryEpisodes: [3], episodeMap: null });
  });

  test('an entry Simkl cannot build is skipped on its own and never queued', async () => {
    const item: NormalizedMediaItem = {
      id: 'letterboxd-inception', title: 'Inception', coverImage: '', type: 'MOVIE',
      currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: {},
    };
    const calls: unknown[] = [];
    const adapter = simklLogAdapter(client(), (entry) => {
      calls.push(entry);
      return Promise.resolve({ status: 'ok' as const });
    });

    const result = await adapter({ item });

    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('no Simkl-resolvable id'),
    });
  });
});

describe('planLogWrite — reconcile across both domains (plan 0027 U4)', () => {
  test('early-season history does not satisfy a later-episode intent', async () => {
    const queryClient = client();
    const item = animeSeries();
    // The user watched the show's first three episodes; this entry's episode 3
    // is the show's fifteenth. Before plan 0027 it arrived as S1E3 and was
    // wrongly skipped as "already in sync".
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

  test('a provider without a watch-state read does not turn a rewatch into a catch-up', async () => {
    const queryClient = client();
    const item: NormalizedMediaItem = {
      id: 'trakt-1', title: 'Inception', coverImage: '', type: 'MOVIE',
      currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { trakt: 1, tmdb: 27205 },
    };
    queryClient.setQueryData(traktQueryKeys.watchedMovies(), [item]);

    const plan = await planLogWrite(queryClient, { item }, ['trakt', 'simkl']);

    expect(plan.rewatch).toBe(true);
    expect(plan.skipped).toEqual([]);
    expect(plan.writeTargets).toEqual(['trakt', 'simkl']);
  });
});

describe('planLogWrite — a retry reads fresh watch state (plan 014)', () => {
  const inception: NormalizedMediaItem = {
    id: 'trakt-1', title: 'Inception', coverImage: '', type: 'MOVIE',
    currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { trakt: 1, tmdb: 27205 },
  };

  async function connectTrakt() {
    const { setProviderClientId, setProviderClientSecret, setProviderSession } = await import(
      '@/state/session/tokens'
    );
    setProviderSession('trakt', { accessToken: 'tok' });
    setProviderClientId('trakt', 'cid');
    setProviderClientSecret('trakt', 'secret');
  }

  test('a first watch that landed but reported failure is not sent again', async () => {
    await connectTrakt();
    const queryClient = client();
    let watched: unknown[] = [];
    let posts = 0;
    httpHandler = async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/sync/history')) {
        posts += 1;
        // The server commits the play, then the response times out.
        watched = [{
          plays: 1, last_watched_at: '2026-11-01T00:00:00.000Z', last_updated_at: '2026-11-01T00:00:00.000Z',
          movie: { title: 'Inception', year: 2010, ids: { trakt: 1, tmdb: 27205 } },
        }];
        return new Response('', { status: 504 });
      }
      if (url.includes('/sync/watched/movies')) return Response.json(watched);
      return new Response('{}');
    };

    // The same steps useLogMedia's mutationFn runs, against the real Trakt adapter.
    const first = await planLogWrite(queryClient, { item: inception }, ['trakt']);
    const report = await fanOutLog(logAdapters(queryClient), first.writeTargets, first.variables);
    expect(report.failed).toEqual(['trakt']);
    invalidateAfterLog(queryClient, first.item, report.succeeded, first.skipped);

    const retry = await planLogWrite(
      queryClient,
      { item: inception, providers: report.failed, retryOf: { rewatch: first.rewatch } },
      ['trakt'],
    );

    expect(retry.skipped).toEqual(['trakt']);
    expect(retry.writeTargets).toEqual([]);
    expect(retry.variables).not.toHaveProperty('retryOf');
    expect(posts).toBe(1);
  });

  const tmdbShow: NormalizedMediaItem = {
    id: 'tmdb-1399', title: 'Game of Thrones', coverImage: '', type: 'TV',
    currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { tmdb: 1399 },
  };

  test.each([
    ['its read fails', { item: inception }],
    ['it has no Trakt id to read by', { item: tmdbShow, episodes: [{ season: 1, number: 1 }] }],
  ])('a retried target is reported, not sent again, when %s', async (_, intent) => {
    await connectTrakt();
    const queryClient = client();
    queryClient.setQueryData(traktQueryKeys.watchedMovies(), []);
    let posts = 0;
    httpHandler = async (_input, init) => {
      if (init?.method === 'POST') posts += 1;
      return new Response('', { status: 503 });
    };

    const retry = await planLogWrite(
      queryClient,
      { ...intent, providers: ['trakt'], retryOf: { rewatch: false } },
      ['trakt'],
    );
    const report = await fanOutLog(
      withUnconfirmed(logAdapters(queryClient), retry.unconfirmed),
      retry.writeTargets,
      retry.variables,
    );

    expect(retry.unconfirmed).toEqual(['trakt']);
    expect(report.failed).toEqual(['trakt']);
    expect(manualLinkForOutcome(report.outcomes[0], intent.item)).not.toBeNull();
    expect(posts).toBe(0);
  });

  test('a rewatch retry stays a rewatch when no target can be read', async () => {
    const plan = await planLogWrite(
      client(),
      { item: inception, providers: ['simkl'], retryOf: { rewatch: true } },
      ['simkl'],
    );

    expect(plan.writeTargets).toEqual(['simkl']);
    expect(plan.unconfirmed).toEqual([]);
    expect(plan.variables.rewatch).toBe(true);
  });
});
