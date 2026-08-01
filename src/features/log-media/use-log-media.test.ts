import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { AniZipEpisodeMap } from '@/lib/providers/mapping/anizip';
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

let episodeMap: AniZipEpisodeMap | null = null;
let seasonLayout: SeasonLayout | null = null;
const mappingCalls: string[] = [];

mock.module('@/state/queries/mapping', () => ({
  // Enrichment already has every id it needs on these fixtures.
  cachedAniZipIds: () => Promise.resolve(null),
  cachedAniListFilmId: () => Promise.resolve(null),
  cachedTraktLookup: () => Promise.resolve(null),
  cachedTraktTextSearch: () => Promise.resolve(null),
  // Unreachable from the log path, but `mock.module` is process-wide and Up
  // Next's Letterboxd release resolve imports it by name.
  cachedTmdbMovieIdByTitle: () => Promise.resolve(null),
  cachedAniZipEpisodeMap: (_client: unknown, anilistId: number) => {
    mappingCalls.push(`episode-map:${anilistId}`);
    return Promise.resolve(episodeMap);
  },
  cachedSeasonLayout: (_client: unknown, ids: Record<string, number>) => {
    mappingCalls.push(`season-layout:${JSON.stringify(ids)}`);
    return Promise.resolve(seasonLayout);
  },
}));

const { planLogWrite, simklLogAdapter, withMappingSkips } = await import(
  './use-log-media'
);
const { fanOutLog } = await import('./fan-out');
const { manualLinkForOutcome, splitSkippedOutcomes } = await import(
  './manual-write-links'
);
const { traktQueryKeys } = await import('@/state/queries/trakt');
const { anilistQueryKeys } = await import('@/state/queries/anilist');

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

const ONE_CONTINUOUS_SEASON: SeasonLayout = [{ season: 1, episodeCount: 24 }];

/** The other real shape (Mushoku Tensei): the tracker splits like TVDB does. */
const SPLIT_BY_SEASON: SeasonLayout = [
  { season: 1, episodeCount: 12 },
  { season: 2, episodeCount: 24 },
];

/** A first-season entry: identity mapping, the regression-guard case. */
function seasonOneMap(): AniZipEpisodeMap {
  return new Map(
    Array.from({ length: 12 }, (_, index) => [
      index + 1,
      { season: 1, number: index + 1, absolute: index + 1 },
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
  mappingCalls.length = 0;
  store.clear();
});

describe('planLogWrite — entry → canonical translation (plan 0027 U3)', () => {
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

  test('a tracker that does split by season gets the TVDB pair instead', async () => {
    seasonLayout = SPLIT_BY_SEASON;
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, []);

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
    ]);

    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });

  test('Serializd receives the same resolved numbering as Trakt', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, []);

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'serializd',
    ]);

    expect(plan.targets).toEqual(['trakt', 'serializd']);
    expect(plan.variables.episodes).toEqual([{ season: 1, number: 15 }]);
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
      { season: 1, number: 13 },
      { season: 1, number: 14 },
      { season: 1, number: 15 },
    ]);
    expect(plan.variables.entryEpisodes).toEqual([1, 2, 3]);
  });

  test('an unreadable season layout skips rather than writing a raw TVDB season', async () => {
    seasonLayout = null;
    const queryClient = client();
    const item = animeSeries();
    seedAniList(queryClient, 185660, { status: 'CURRENT', progress: 2 });

    const plan = await planLogWrite(queryClient, { item, entryEpisodes: [3] }, [
      'trakt',
      'anilist',
    ]);

    expect([...plan.mappingSkips.keys()]).toEqual(['trakt']);
    expect(plan.variables.episodes).toBeUndefined();
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

function tvShow(): NormalizedMediaItem {
  return {
    id: 'trakt-42',
    title: 'A Live-Action Show',
    coverImage: '',
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '2026-07-26T00:00:00.000Z',
    externalIds: { trakt: 42, tmdb: 4242 },
  };
}

describe('the Simkl leg of the log fan-out (plan 0034 U6)', () => {
  test('a TV log with Trakt + Serializd + Simkl connected fires all three adapters', async () => {
    const queryClient = client();
    const item = tvShow();
    seedTrakt(queryClient, 42, []);

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 1, number: 2 }] },
      ['trakt', 'serializd', 'simkl'],
    );

    expect(plan.targets).toEqual(['trakt', 'serializd', 'simkl']);
    expect(plan.writeTargets).toEqual(['trakt', 'serializd', 'simkl']);

    const seen = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(recordingAdapters(seen), plan.writeTargets, plan.variables);

    expect(result.succeeded).toEqual(['trakt', 'serializd', 'simkl']);
    expect(seen.get('simkl')?.episodes).toEqual([{ season: 1, number: 2 }]);
  });

  test('a Simkl failure is named with its manual link, never masking the others', async () => {
    const queryClient = client();
    const item = tvShow();
    seedTrakt(queryClient, 42, []);

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 1, number: 2 }] },
      ['trakt', 'serializd', 'simkl'],
    );

    const seen = new Map<ProviderId, LogMediaVariables>();
    const result = await fanOutLog(
      { ...recordingAdapters(seen), simkl: () => Promise.reject(new Error('Simkl said no')) },
      plan.writeTargets,
      plan.variables,
    );

    // Partial-failure contract (AGENTS.md): Simkl is named, the others land.
    expect(result.succeeded).toEqual(['trakt', 'serializd']);
    expect(result.failed).toEqual(['simkl']);
    const failure = result.outcomes.find((outcome) => outcome.provider === 'simkl');
    expect(failure).toMatchObject({ status: 'error', message: 'Simkl said no' });
    // …and plan 0022's fallback affordance can build a Simkl link for it.
    expect(manualLinkForOutcome(failure!, item)).toBeTruthy();
  });

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

  test('a canonical batch with no ani.zip table passes null so writes.ts skips, not guesses', async () => {
    episodeMap = null;
    const queryClient = client();
    const item = animeSeries();

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 2, number: 3 }] },
      ['simkl'],
    );

    const entries: Array<{ episodeMap?: unknown }> = [];
    const adapter = simklLogAdapter(queryClient, (entry) => {
      entries.push(entry);
      return Promise.resolve({ status: 'ok' as const });
    });
    await adapter(plan.variables);

    // `logToSimkl` answers a null table with its reasoned skip (plan 0027:
    // wrong write is worse than none) — the adapter's job is only to not hide
    // the miss.
    expect(entries[0].episodeMap).toBeNull();
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

  test('Trakt already at S1E15 with AniList behind → AniList catch-up, Trakt reconcile-skip', async () => {
    const queryClient = client();
    const item = animeSeries();
    seedTrakt(queryClient, 999, ['1-13', '1-14', '1-15']);
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
    seedTrakt(queryClient, 999, ['1-13', '1-14', '1-15']);
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
