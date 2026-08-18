import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { logToAniList } from '@/lib/providers/anilist/writes';
import { logToLetterboxd } from '@/lib/providers/letterboxd/writes';
import { logToSerializd } from '@/lib/providers/serializd/writes';
import { logToSimkl, type SimklLogEntry } from '@/lib/providers/simkl/writes';
import {
  diaryHasEpisode,
  getSerializdDiary,
  type SerializdDiaryPage,
} from '@/lib/providers/serializd/diary';
import {
  getWatchedEpisodeKeys,
  serializdHasEpisodes,
} from '@/lib/providers/serializd/progress';
import { recordRecentTags } from '@/state/prefs/recent-tags';
import { letterboxdDeps, letterboxdQueryKeys } from '@/state/queries/letterboxd';
import { serializdDeps, serializdQueryKeys } from '@/state/queries/serializd';
import { simklDeps, simklQueryKeys } from '@/state/queries/simkl';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { translateEntryEpisodes } from '@/lib/providers/mapping/episode-translation';
import {
  cachedAniZipEpisodeMap,
  cachedSeasonLayout,
} from '@/state/queries/mapping';
import { resolveWriteTargets } from '@/lib/providers/routing';
import { getShowWatchedProgress, getWatchedMovies } from '@/lib/providers/trakt/reads';
import { logToTrakt } from '@/lib/providers/trakt/writes';
import type { ProviderId } from '@/lib/providers/types';
import { anilistDeps, anilistQueryKeys } from '@/state/queries/anilist';
import { getEntryState } from '@/lib/providers/anilist/reads';
import { traktDeps, traktQueryKeys } from '@/state/queries/trakt';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';
import { removeWatchedFromWatchlist } from './remove-watched-from-watchlist';
import { currentPlatform } from './use-log-targets';
import {
  anilistHasEpisodes,
  anilistHasFilm,
  reconcileLogTargets,
  traktHasEpisodes,
  traktHasFilm,
  type ProviderWatchRecord,
} from './reconcile';
import {
  fanOutLog,
  type WriteAdapter,
  type LogMediaResult,
  type LogMediaVariables,
  type ProviderWriteResult,
  type ProviderWriteOutcome,
} from './fan-out';

/**
 * One entry per write-capable provider. `Effect.runPromise` here is the same
 * containment boundary `state/queries/*` uses — no Effect type escapes.
 *
 * Simkl is the one write-capable provider **not** in this map: its adapter
 * needs the shared query cache (the ani.zip table for a canonically-numbered
 * anime batch), so it is built per-mutation by `simklLogAdapter` and merged in
 * `logAdapters(queryClient)` below.
 */
const LOG_ADAPTERS: Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>> = {
  // Resolves a ProviderWriteResult itself: a rewatch play Trakt's own
  // "Disable Multiple Plays" setting declines comes back as a reasoned skip.
  trakt: ({ item, episode, episodes, watchedAt }) =>
    Effect.runPromise(
      logToTrakt(traktDeps(), item, {
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
      }),
    ),
  // AniList is the entry-relative half of the fan-out (plan 0027 KTD5): it
  // reads `entryEpisodes` — the entry's own 1..n numbering — and never the
  // canonical `episodes` the ani.zip translation produced for Trakt/Serializd.
  // A sequel entry's episode 3 is `progress: 3` here while Trakt gets S02E03.
  anilist: ({ item, episode, episodes, entryEpisodes, rewatch }) =>
    Effect.runPromise(
      logToAniList(anilistDeps(), item, {
        // AniList tracks a single progress counter — a whole-season batch
        // lands as the batch's highest episode number.
        ...(entryEpisodes != null && entryEpisodes.length > 0
          ? { progress: Math.max(...entryEpisodes) }
          : episode != null
            ? { progress: episode.number }
            : episodes != null && episodes.length > 0
              ? { progress: Math.max(...episodes.map((e) => e.number)) }
              : {}),
        ...(rewatch === true ? { rewatch: true } : {}),
      }),
    ).then(okResult),
  // Diary write as the signed-in web user (plan 0012): run the write inside the
  // authenticated WebView, POSTing the modern /api/v0/production-log-entries JSON
  // API (the legacy /s/save-diary-entry form is dead). Tags are the app's
  // Letterboxd-only log field; watchedAt sets the diary date; rewatch comes from
  // the reconcile step. Registered now but only
  // reached once registry canWrite flips true (after the sign-in WebView lands)
  // — a missing session fails as ProviderAuthError, surfaced per-provider.
  letterboxd: ({ item, watchedAt, tags, rewatch }) =>
    Effect.runPromise(
      logToLetterboxd(letterboxdDeps(), item, {
        ...(watchedAt != null ? { watchedAt } : {}),
        ...(tags != null && tags.length > 0 ? { tags } : {}),
        ...(rewatch === true ? { rewatch: true } : {}),
      }),
    ).then(okResult),
  // Serializd (plan 0017 R8): logToSerializd already resolves a ProviderWriteResult
  // (ok | skipped) that maps straight through the fan-out contract — a season
  // that can't be resolved or an item with no tmdb becomes a `skipped` outcome
  // (R9), not a thrown error. A partial write (episode watched, diary failed)
  // fails loudly so reconcile re-attempts the diary entry (R12).
  serializd: ({ item, episode, episodes, watchedAt, tags, rewatch }) =>
    Effect.runPromise(
      logToSerializd(serializdDeps(), item, {
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
        ...(tags != null && tags.length > 0 ? { tags } : {}),
        ...(rewatch === true ? { rewatch: true } : {}),
      }),
    ),
};

/** Adapters that resolve `void` report a plain success through the contract. */
function okResult(): ProviderWriteResult {
  return { status: 'ok' };
}

/**
 * Simkl's log adapter (plan 0034 U6). Built per-mutation rather than living in
 * `LOG_ADAPTERS` because one of its inputs comes from the shared query cache:
 * an ANIME batch that arrives *canonically* numbered (a TMDB-shaped details
 * screen, the seasons UI) must carry the ani.zip table so `logToSimkl` can
 * reverse-map `{season, number}` into the AniDB-domain entry number Simkl's
 * anime catalog counts by (KTD-6). The lookup is the same cached one the
 * forward translation uses (plan 0027, `cachedAniZipEpisodeMap`), so an
 * AniList-origin log that already fetched the table pays nothing here — and it
 * is gated to the one shape that needs it: entry-domain input (`entryEpisodes`)
 * already *is* the AniDB-derived domain and passes through verbatim, and films
 * and non-anime TV/movies never consult the table at all.
 *
 * A missing/unresolvable table is passed as `null` on purpose: writes.ts
 * answers with its reasoned skip (plan 0027 — wrong write is worse than none),
 * which flows through the fan-out contract and plan 0022's manual-link
 * affordance like any other adapter-reported skip.
 *
 * `log` is injectable for tests only; the default is the real one-element
 * batch per fan-out (KTD-3: every Simkl write for one item is ONE POST behind
 * Simkl's ~20s per-user write lock).
 */
export function simklLogAdapter(
  queryClient: QueryClient,
  log: (entry: SimklLogEntry) => Promise<ProviderWriteResult> = (entry) =>
    Effect.runPromise(logToSimkl(simklDeps(), [entry])),
): WriteAdapter<LogMediaVariables> {
  return async ({ item, episode, episodes, entryEpisodes, watchedAt }) => {
    const needsMap =
      item.type === 'ANIME' &&
      item.isFilm !== true &&
      (entryEpisodes == null || entryEpisodes.length === 0) &&
      (episodes != null || episode != null);
    const anilistId = item.externalIds.anilist;
    const episodeMap =
      needsMap && anilistId != null
        ? await cachedAniZipEpisodeMap(queryClient, anilistId).catch(() => null)
        : null;
    return log({
      item,
      ...(episode != null ? { episode } : {}),
      ...(episodes != null ? { episodes } : {}),
      ...(entryEpisodes != null ? { entryEpisodes } : {}),
      ...(watchedAt != null ? { watchedAt } : {}),
      episodeMap,
    });
  };
}

/** The full adapter map for one mutation: the static entries plus Simkl's. */
export function logAdapters(
  queryClient: QueryClient,
): Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>> {
  return { ...LOG_ADAPTERS, simkl: simklLogAdapter(queryClient) };
}

/**
 * Turn each mapping-blocked provider's adapter into a no-op that resolves its
 * reason (plan 0027 R3/KTD3). Deliberately *not* a new `ProviderWriteOutcome`
 * status or a pre-fan-out filter: routing it through the ordinary adapter path
 * means `fanOutLog`, the outcome merge, and plan 0022's manual-link affordance
 * all treat it exactly like Serializd's own unresolvable-season skip.
 */
export function withMappingSkips(
  adapters: Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>>,
  mappingSkips: ReadonlyMap<ProviderId, string>,
): Partial<Record<ProviderId, WriteAdapter<LogMediaVariables>>> {
  if (mappingSkips.size === 0) return adapters;
  const overrides = Object.fromEntries(
    [...mappingSkips].map(([provider, reason]): [ProviderId, WriteAdapter<LogMediaVariables>] => [
      provider,
      () => Promise.resolve({ status: 'skipped', reason }),
    ]),
  );
  return { ...adapters, ...overrides };
}

/** Serializd reconcile/progress reads share this staleness (KTD7/R17). */
const SERIALIZD_STALE_MS = 5 * 60_000;

/**
 * Providers that write canonically-numbered episodes (plan 0027 KTD5).
 *
 * Simkl is deliberately **absent** (plan 0034 U6 decision): its anime writes
 * speak the AniDB/entry domain natively — `entryEpisodes` passes through
 * verbatim (KTD-6) — and `entryEpisodes` is populated for every entry-domain
 * log regardless of this list, so membership isn't needed for that. Listing it
 * would actively hurt: an anilist+simkl-only user would pay the ~1 MB ani.zip
 * fetch the R7 short-circuit exists to avoid, and a translation failure would
 * wrongly mapping-skip Simkl even though its entry-domain write is still safe.
 * (Simkl's non-anime TV writes do read the translated canonical `episodes`,
 * but only ever alongside Trakt/Serializd-triggered translation or a
 * canonical-origin log that needed no translation at all.)
 */
const CANONICAL_EPISODE_PROVIDERS: readonly ProviderId[] = ['trakt', 'serializd'];

function intendedEpisodes(
  variables: LogMediaVariables,
): Array<{ season: number; number: number }> | null {
  if (variables.episodes != null && variables.episodes.length > 0) {
    return variables.episodes;
  }
  if (variables.episode != null) return [variables.episode];
  return null;
}

/**
 * The two numbering domains one log action lives in (plan 0027 KTD2/KTD5).
 * Both are `null` for a film (nothing episodic to compare), and `canonical` is
 * `null` on its own when an entry-domain batch couldn't be translated — the
 * signal that Trakt/Serializd get a reasoned skip instead of a guessed season.
 */
interface LogDomains {
  canonical: Array<{ season: number; number: number }> | null;
  entry: number[] | null;
}

interface LogPlan {
  item: NormalizedMediaItem;
  targets: ProviderId[];
  domains: LogDomains;
  /** Canonical-domain providers blocked by a mapping miss → their reason (R3). */
  mappingSkips: Map<ProviderId, string>;
}

/**
 * Everything a log needs settled *before* reconcile: cross-provider ids, the
 * routed targets, and — the plan 0027 step — which canonical `{season, number}`
 * pairs an AniList-entry-relative batch actually means. Shared by the mutation
 * and by `prefetchLogReconcile`, so the confirm sheet warms exactly what the
 * confirmed write will read (R5: one translation step, not one per caller).
 */
async function resolveLogPlan(
  queryClient: QueryClient,
  variables: LogMediaVariables,
  connected: readonly ProviderId[],
): Promise<LogPlan> {
  const item = await enrichExternalIds(queryClient, variables.item, connected);

  const canonicalInput = intendedEpisodes(variables);
  const entryInput =
    variables.entryEpisodes != null && variables.entryEpisodes.length > 0
      ? variables.entryEpisodes
      : null;

  const targets = resolveWriteTargets(item, connected, {
    capability: 'log',
    // Only a *canonical*-domain batch can drop AniList (plan 0011 / R6): that
    // guard exists because a canonical season 2 has no place on a season-1
    // AniList entry. An entry-domain batch is already in AniList's own
    // numbering, so it stays a target whatever season it maps to.
    nonSeasonOneEpisodes:
      entryInput == null &&
      canonicalInput != null &&
      canonicalInput.some((episode) => episode.season !== 1),
    onlyProviders: variables.providers,
    platform: currentPlatform(),
  });

  const mappingSkips = new Map<ProviderId, string>();
  if (entryInput == null) {
    return {
      item,
      targets,
      domains: {
        canonical: canonicalInput,
        // A canonical season-1 batch *is* the entry's own numbering (plan
        // 0011). A season-2+ batch has **no** entry-domain reading: AniList
        // never receives it (the nonSeasonOneEpisodes guard above), and Simkl
        // (plan 0034 U6) must reverse-map it through the ani.zip table in its
        // adapter rather than trust a raw episode number as an AniDB one —
        // deriving `entry` here would hand it S02E03 as "entry episode 3",
        // the wrong-identity write plan 0027 exists to prevent.
        entry:
          canonicalInput != null &&
          canonicalInput.every((episode) => episode.season === 1)
            ? canonicalInput.map((episode) => episode.number)
            : null,
      },
      mappingSkips,
    };
  }

  const canonicalTargets = targets.filter((provider) =>
    CANONICAL_EPISODE_PROVIDERS.includes(provider),
  );
  // No canonical-numbering target → nothing needs translating, so an
  // AniList-only user never pays for the ~1 MB ani.zip document (R7), and no
  // skip outcome appears for a provider that was never a target.
  if (canonicalTargets.length === 0) {
    return { item, targets, domains: { canonical: null, entry: entryInput }, mappingSkips };
  }

  const anilistId = item.externalIds.anilist;
  // Two reads, one round trip: ani.zip's entry→TVDB rows, and how the
  // destination trackers themselves split this show into seasons. The second
  // is not optional — TVDB's seasons frequently aren't the trackers'
  // (docs/solutions/anizip-tvdb-seasons-vs-tracker-seasons.md).
  const [episodeMap, layout] = await Promise.all([
    anilistId == null
      ? Promise.resolve(null)
      : cachedAniZipEpisodeMap(queryClient, anilistId),
    cachedSeasonLayout(queryClient, {
      ...(item.externalIds.tmdb != null ? { tmdb: item.externalIds.tmdb } : {}),
      ...(item.externalIds.trakt != null ? { trakt: item.externalIds.trakt } : {}),
    }),
  ]);
  const translated =
    anilistId == null
      ? ({ ok: false, reason: 'no AniList id to resolve a canonical season from' } as const)
      : translateEntryEpisodes(episodeMap, entryInput, {
          layout,
          ...(item.totalEpisodes != null
            ? { declaredEpisodeCount: item.totalEpisodes }
            : {}),
        });

  if (!translated.ok) {
    // Wrong identity is strictly worse than none
    // (docs/solutions/trakt-text-search-wrong-movie-match.md) — and the old
    // `season: 1` literal *was* the wrong identity. Skip loudly instead.
    for (const provider of canonicalTargets) mappingSkips.set(provider, translated.reason);
  }

  return {
    item,
    targets,
    domains: {
      canonical: translated.ok ? translated.episodes : null,
      entry: entryInput,
    },
    mappingSkips,
  };
}

/**
 * Whether `provider` already records the intended watch — the input to the
 * plan 0011 reconcile rule. Reads go through the query cache (fetchQuery), so
 * repeated logs don't refetch cold state every time. A failed state read
 * counts as "doesn't have it": the write is the user's actual intent, and a
 * duplicate on a provider beats silently dropping the log.
 *
 * Each provider is asked in its own numbering domain (plan 0027 R4): Trakt and
 * Serializd against `domains.canonical`, AniList against `domains.entry`.
 */
async function providerHasWatch(
  queryClient: QueryClient,
  provider: ProviderId,
  item: NormalizedMediaItem,
  domains: LogDomains,
): Promise<boolean> {
  const episodes = domains.canonical;
  try {
    if (provider === 'trakt') {
      if (episodes == null) {
        const watched = await queryClient.fetchQuery({
          queryKey: traktQueryKeys.watchedMovies(),
          queryFn: () => Effect.runPromise(getWatchedMovies(traktDeps())),
        });
        return traktHasFilm(watched, item);
      }
      const traktId = item.externalIds.trakt;
      if (traktId == null) return false;
      const progress = await queryClient.fetchQuery({
        queryKey: traktQueryKeys.showProgress(traktId),
        queryFn: () =>
          Effect.runPromise(getShowWatchedProgress(traktDeps(), { traktId })),
      });
      return traktHasEpisodes(progress.watchedKeys, episodes);
    }

    if (provider === 'anilist') {
      const mediaId = item.externalIds.anilist;
      if (mediaId == null) return false;
      const state = await queryClient.fetchQuery({
        queryKey: anilistQueryKeys.entryState(mediaId),
        queryFn: () =>
          Effect.runPromise(getEntryState(anilistDeps(), { mediaId })),
      });
      const entryNumbers = domains.entry;
      return entryNumbers == null
        ? anilistHasFilm(state.entry)
        : anilistHasEpisodes(state.entry, entryNumbers);
    }

    if (provider === 'serializd') {
      const tmdbId = item.externalIds.tmdb;
      const username = getSerializdUsername();
      // TV-only: no join key, no session, or a movie (no episodes) → nothing to
      // reconcile against, so treat as "doesn't have it" (write is the intent).
      if (tmdbId == null || username == null || episodes == null) return false;

      const watchedKeys = await queryClient.fetchQuery({
        queryKey: serializdQueryKeys.progress(username, tmdbId),
        queryFn: () =>
          Effect.runPromise(getWatchedEpisodeKeys(serializdDeps(), { tmdbId })),
        staleTime: SERIALIZD_STALE_MS,
      });
      if (!serializdHasEpisodes(watchedKeys, episodes)) return false;

      // R12/AE6: a Serializd log is a two-call sequence, so episode-watched
      // progress alone doesn't prove the diary entry landed. A single-episode
      // log creates a diary entry — require its presence, else a retry after a
      // partial write would skip and silently drop the diary write. A whole-
      // season batch (/watched_v2) creates no diary entry, so progress suffices.
      if (episodes.length === 1) {
        return await serializdDiaryHasEpisode(queryClient, username, tmdbId, episodes[0]);
      }
      return true;
    }
  } catch {
    return false;
  }
  // Providers without a branch fall through to the conservative default:
  // Letterboxd has no readable watch state (RSS diary only), and Simkl —
  // readable since plan 0034 U7 — deliberately has no branch yet, because it
  // is not the mechanical parallel of the ones above. A real Simkl reconcile
  // needs the *unfiltered* /sync/all-items snapshot (the item may sit in any
  // status bucket; the cached up-next legs hold only watching/plantowatch)
  // fetched fresh per log — the heaviest Simkl read, against the
  // activities-gated refetch discipline of
  // docs/solutions/simkl-rate-limits-and-write-lock.md — and anime compares
  // in Simkl's AniDB-convention numbering (plan 0034 KTD-6), so a
  // canonical-origin batch needs the same ani.zip reverse map
  // `simklLogAdapter` uses before its watchedKeys can be trusted. A
  // wrong-domain compare recreates the false in-sync skip plan 0027 removed.
  // Deferred to follow-up (plan 0034 Scope Boundaries); until then both count
  // as "doesn't have it", so the write (the user's actual intent) always
  // fires.
  return false;
}

/**
 * R12 diary-evidence check: is the intended episode present in Serializd's
 * diary? Reuses the diary screen's cached pages when loaded, else fetches a
 * fresh page 1 (recent logs surface first) without writing under the infinite
 * query key.
 */
async function serializdDiaryHasEpisode(
  queryClient: QueryClient,
  username: string,
  tmdbId: number,
  episode: { season: number; number: number },
): Promise<boolean> {
  const params = { tmdbId, episodeNumber: episode.number, season: episode.season };
  const cached = queryClient.getQueryData<{ pages?: SerializdDiaryPage[] }>(
    serializdQueryKeys.diary(username),
  );
  const cachedEntries = (cached?.pages ?? []).flatMap((page) => page.entries);
  if (diaryHasEpisode(cachedEntries, params)) return true;

  const page = await Effect.runPromise(getSerializdDiary(serializdDeps(), { page: 1 }));
  return diaryHasEpisode(page.entries, params);
}

export function invalidateAfterLog(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  succeeded: readonly ProviderId[],
  skipped: readonly ProviderId[] = [],
) {
  // The write changed watch history — refresh the reads that show it. Runs on
  // the *enriched* item (the mutation may have discovered ids the caller's
  // copy lacks), which is why this lives here and not in onSuccess.
  if (succeeded.includes('trakt')) {
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchedShows() });
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchedMovies() });
    // The fan-out landed a new log in Trakt history — the diary must show it on
    // its next visit (plan 0016 KTD9).
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.history() });
    // Trakt removes a watched item from the watchlist server-side — "watching 1
    // episode will remove the entire show or season" — so a log silently
    // changes the watchlist too, and the cached read would otherwise sit stale
    // for the full window showing something the user has already watched (plan
    // 0031 KTD-5). The prefix, not a per-sort key: this path can't know which
    // type/sort the surface requested.
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() });
    const traktId = item.externalIds.trakt;
    if (traktId != null) {
      // TV logs also change this show's seasons/progress views (plan 0010).
      queryClient.invalidateQueries({
        queryKey: traktQueryKeys.showProgress(traktId),
      });
    }
  }
  if (succeeded.includes('anilist')) {
    // A CURRENT write moves the entry *out* of the PLANNING slice, so the
    // watchlist's AniList leg is stale the moment this succeeds — third derived
    // key over the same read (plan 0031 U12/KTD-5).
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.plannedAnime() });
    // Both derived keys come off this one — invalidating only the derived keys
    // would refetch them straight off a stale entries cache (plan 0019 U2).
    queryClient.invalidateQueries({
      queryKey: anilistQueryKeys.currentAnimeEntries(),
    });
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.listActivity() });
    const mediaId = item.externalIds.anilist;
    if (mediaId != null) {
      queryClient.invalidateQueries({
        queryKey: anilistQueryKeys.entryState(mediaId),
      });
    }
  }
  if (succeeded.includes('letterboxd')) {
    // A fanned-out Letterboxd diary write appears in the RSS window next visit.
    const username = getLetterboxdUsername();
    if (username != null) {
      queryClient.invalidateQueries({
        queryKey: letterboxdQueryKeys.diary(username),
      });
    }
  }
  if (succeeded.includes('simkl')) {
    // The history POST moved items between Simkl's library buckets — every
    // cached all-items filter is stale (the prefix, not a per-filter key: this
    // path can't know which type/status a surface requested), and so is the
    // activities delta that gates their refetch (plan 0034 KTD-5). Registered
    // here before U7 flipped canRead — which is what made the flip
    // read-correct on day one.
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.allItemsRoot() });
    queryClient.invalidateQueries({ queryKey: simklQueryKeys.activities() });
  }
  if (succeeded.includes('serializd')) {
    // The write landed a new diary entry (and moved progress) — refresh both so
    // the unified diary and the next reconcile see it.
    const username = getSerializdUsername();
    if (username != null) {
      queryClient.invalidateQueries({ queryKey: serializdQueryKeys.diary(username) });
      const tmdbId = item.externalIds.tmdb;
      if (tmdbId != null) {
        queryClient.invalidateQueries({
          queryKey: serializdQueryKeys.progress(username, tmdbId),
        });
      }
    }
  }
  // **Last on purpose.** `invalidateQueries` starts the refetch of the active
  // Up Next query *synchronously*, and `fetchUpNextInputs` reaches its
  // per-provider `fetchQuery` calls before this function's next statement
  // runs — so any provider cache invalidated *below* this line is still
  // fresh when the gather reads it, and the recompute lands on pre-write
  // data. That is exactly what stranded Simkl-sourced Continue Watching
  // cards (owner report 2026-08-18: a logged episode only advanced after a
  // manual pull-to-refresh) while Trakt and AniList cards — whose branches
  // happen to sit above — advanced correctly. Keep this the final statement:
  // `docs/solutions/invalidate-order-strands-continue-watching.md`.
  //
  // Up Next is computed from Trakt/AniList/Simkl watch state (Simkl joined the
  // provider-keyed inputs in plan 0034 U8), so a log to any of them must
  // recompute the sections — not just the per-provider caches the other
  // branches refresh. This invalidation is also the settle signal the
  // quick-log card waits on before advancing (plan 0019 KTD-6): a provider
  // missing from this gate strands its users' quick-log in the settle window.
  // **Skips count**: a reconcile-skip means the provider already records the
  // watch — its state is *ahead* of the computed sections, exactly the case a
  // recompute exists for — and the quick-log card advances on
  // skipped-or-succeeded (`resolveQuickLog`), so gating on `succeeded` alone
  // left an all-skip log with no refetch to settle against (owner report
  // 2026-08-02, "Logged — refresh to update").
  const touched = (provider: ProviderId) =>
    succeeded.includes(provider) || skipped.includes(provider);
  if (touched('trakt') || touched('anilist') || touched('simkl')) {
    queryClient.invalidateQueries({ queryKey: upNextQueryKeys.inputs() });
  }
}

/**
 * Warm the reads a log of `item` will make, so a confirmed write doesn't stall
 * on cold reconcile fetches (plan 0019 quick-log). Runs the mutation's own
 * front matter — identity enrichment, then each applicable provider's
 * watch-state read — against the shared cache while the confirm modal is open,
 * so `useLogMedia` finds everything warm on confirm. Best-effort: it never
 * throws (every read already degrades to "doesn't have it").
 */
export async function prefetchLogReconcile(
  queryClient: QueryClient,
  connected: readonly ProviderId[],
  variables: LogMediaVariables,
): Promise<void> {
  try {
    // Same front matter the mutation runs — including plan 0027's ani.zip
    // episode-map lookup, so a sequel-season log doesn't wait on the ~1 MB
    // document at confirm time.
    const plan = await resolveLogPlan(queryClient, variables, connected);
    await Promise.all(
      plan.targets
        .filter((provider) => !plan.mappingSkips.has(provider))
        .map((provider) =>
          providerHasWatch(queryClient, provider, plan.item, plan.domains),
        ),
    );
  } catch {
    // Prefetch is an optimization — a miss just means the write pays the read.
  }
}

/**
 * Everything the fan-out needs decided before a single write fires — exported
 * because it *is* the decision layer, and testing it is how the plan 0027
 * chain (enrich → translate → route → reconcile) gets covered end to end
 * without mounting a mutation.
 */
export interface LogWritePlan {
  item: NormalizedMediaItem;
  /** Every applicable provider in routing order — the outcome contract's spine. */
  targets: ProviderId[];
  /** Targets whose adapter runs; mapping-skipped ones included, as no-ops. */
  writeTargets: ProviderId[];
  /** Targets reconcile found already in sync (skipped, no reason). */
  skipped: ProviderId[];
  /** Canonical-domain providers blocked by a mapping miss → their reason (R3). */
  mappingSkips: ReadonlyMap<ProviderId, string>;
  /** What every adapter sees: canonical `episodes` *and* entry `entryEpisodes`. */
  variables: LogMediaVariables;
  rewatch: boolean;
}

/**
 * Route, translate, and reconcile — the whole front half of a log write.
 */
export async function planLogWrite(
  queryClient: QueryClient,
  variables: LogMediaVariables,
  connected: readonly ProviderId[],
): Promise<LogWritePlan> {
  // Identity enrichment, target routing, and (plan 0027) entry → canonical
  // episode translation. Defensive manual-target exclusion happens in there
  // too (plan 0022 R2/KTD-3): the sheet already drops manual-only targets from
  // `variables.providers`, but a caller passing one anyway must never reach
  // the adapter for it.
  const { item, targets, domains, mappingSkips } = await resolveLogPlan(
    queryClient,
    variables,
    connected,
  );

  // A provider whose canonical season couldn't be resolved is neither in sync
  // nor behind — it's unreachable for this batch. Reconciling it would read
  // season-1 keys for a season-2 intent and turn a genuine parity rewatch into
  // a catch-up (plan 0027 R4).
  const reconcileTargets = targets.filter((provider) => !mappingSkips.has(provider));
  const records: ProviderWatchRecord[] = await Promise.all(
    reconcileTargets.map(async (provider) => ({
      provider,
      hasIt: await providerHasWatch(queryClient, provider, item, domains),
    })),
  );
  const decisions = reconcileLogTargets(records);
  const skipped = decisions
    .filter((decision) => decision.action === 'skip')
    .map((decision) => decision.provider);
  // Mapping-skipped providers stay *in* the write targets so their outcome
  // flows through the normal fan-out merge (and plan 0022's manual link
  // fires); their adapter resolves the reason without writing anything.
  const writeTargets = targets.filter((provider) => !skipped.includes(provider));
  const rewatch =
    decisions.length > 0 && decisions.every((decision) => decision.action === 'rewatch');

  // Rebuild the episode fields from the resolved domains rather than
  // forwarding the caller's: after translation the variables carry *both*
  // domains at once (KTD2) — canonical `episodes` for Trakt/Serializd,
  // `entryEpisodes` for AniList — and a single `episode` never survives as its
  // own field (`logToTrakt`/`logToSerializd` treat a one-element batch
  // identically, so the payloads are unchanged).
  const {
    episode: _episode,
    episodes: _episodes,
    entryEpisodes: _entryEpisodes,
    ...rest
  } = variables;

  return {
    item,
    targets,
    writeTargets,
    skipped,
    mappingSkips,
    rewatch,
    variables: {
      ...rest,
      item,
      rewatch,
      ...(domains.canonical != null ? { episodes: domains.canonical } : {}),
      ...(domains.entry != null ? { entryEpisodes: domains.entry } : {}),
    },
  };
}

/**
 * The unified log fan-out (plans 0008 + 0011, todos/005 + 002): enrich the
 * item's cross-provider identity (ani.zip), route to every connected provider
 * applicable to it, reconcile against what each provider already records
 * (catch-up / skip / parity-rewatch), and fire the remaining writes in
 * parallel — never a single-provider write (AGENTS.md). Resolves with
 * per-provider outcomes; throws only when no connected provider applies.
 */
export function useLogMedia() {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: LogMediaVariables): Promise<LogMediaResult> => {
      const plan = await planLogWrite(queryClient, variables, connected);
      if (plan.targets.length === 0) {
        throw new Error(`No connected provider can log "${plan.item.title}"`);
      }
      const { item, targets, skipped } = plan;

      const result = await fanOutLog(
        withMappingSkips(logAdapters(queryClient), plan.mappingSkips),
        plan.writeTargets,
        plan.variables,
      );

      // Both skip flavors ride along: reconcile skips (`skipped`) prove the
      // provider is ahead of the cached sections, and adapter skips
      // (`result.skipped`) cost only a recompute from warm caches.
      invalidateAfterLog(queryClient, item, result.succeeded, [
        ...skipped,
        ...result.skipped,
      ]);

      // A watched film leaves the watchlist (plan 0033 U7) — fired, not
      // awaited: the Letterboxd leg is a second WebView round-trip, and a
      // derived write the user didn't aim must not delay the toast or hold
      // the sheet. `removeWatchedFromWatchlist` never rejects.
      //
      // Simkl (plan 0034 U6): its watchlist remove is still 'manual' (U4's
      // live-probe gate), so this derived path routes **no** second Simkl POST
      // today — which also keeps the film log's history POST alone inside
      // Simkl's ~20s per-user write lock (KTD-3). When the remove flip lands,
      // firing it back-to-back with the log's POST from here would collide
      // with that lock (`400 rate_limit`) — the flip must solve that, not
      // inherit it silently.
      if (result.succeeded.length > 0) {
        void removeWatchedFromWatchlist(queryClient, item, connected);
      }

      // Tags that actually landed become local suggestions on the next sheet
      // (state/prefs/recent-tags.ts) — the offline half of the tag picker's
      // two-source list, and the only source that knows a tag invented seconds
      // ago. Only on a write that succeeded somewhere, and never for a log
      // that carried no tags.
      if (
        variables.tags != null &&
        variables.tags.length > 0 &&
        result.succeeded.length > 0
      ) {
        recordRecentTags(variables.tags);
      }

      // Merge skips back so the caller sees one outcome per applicable
      // provider, in routing order (partial-failure contract, AGENTS.md).
      // Iterates `targets`, not `decisions`: mapping-skipped providers have no
      // decision but must still report their reasoned skip.
      const outcomes: ProviderWriteOutcome[] = targets.map((provider) =>
        skipped.includes(provider)
          ? { provider, status: 'skipped' }
          : (result.outcomes.find((o) => o.provider === provider) ?? {
              provider,
              status: 'error',
              message: 'missing outcome',
            }),
      );

      // `rewatch` is the log verb's own field, not the shared write core's
      // (plan 0031 KTD-4) — spliced back from the plan that computed it.
      return { ...result, outcomes, skipped, rewatch: plan.rewatch };
    },
  });
}
