import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { all } from 'better-all';
import { Effect } from 'effect';

import { logToAniList } from '@/lib/providers/anilist/writes';
import { logToLetterboxd } from '@/lib/providers/letterboxd/writes';
import { logToSerializd } from '@/lib/providers/serializd/writes';
import {
  diaryHasEpisode,
  getSerializdDiary,
  type SerializdDiaryPage,
} from '@/lib/providers/serializd/diary';
import {
  getWatchedEpisodeKeys,
  serializdHasEpisodes,
} from '@/lib/providers/serializd/progress';
import { letterboxdDeps, letterboxdQueryKeys } from '@/state/queries/letterboxd';
import { serializdDeps, serializdQueryKeys } from '@/state/queries/serializd';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { providersForLog, resolveLogWriteTargets } from '@/lib/providers/routing';
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
  type LogAdapter,
  type LogMediaResult,
  type LogMediaVariables,
  type LogWriteResult,
  type ProviderLogOutcome,
} from './fan-out';

/**
 * One entry per write-capable provider. `Effect.runPromise` here is the same
 * containment boundary `state/queries/*` uses — no Effect type escapes.
 */
const LOG_ADAPTERS: Partial<Record<ProviderId, LogAdapter>> = {
  trakt: ({ item, episode, episodes, watchedAt }) =>
    Effect.runPromise(
      logToTrakt(traktDeps(), item, {
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
      }),
    ).then(okResult),
  anilist: ({ item, episode, episodes, rewatch }) =>
    Effect.runPromise(
      logToAniList(anilistDeps(), item, {
        // AniList tracks a single progress counter — a whole-season batch
        // lands as the batch's highest episode number.
        ...(episode != null ? { progress: episode.number } : {}),
        ...(episodes != null && episodes.length > 0
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
  // Serializd (plan 0017 R8): logToSerializd already resolves a LogWriteResult
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
function okResult(): LogWriteResult {
  return { status: 'ok' };
}

/** Serializd reconcile/progress reads share this staleness (KTD7/R17). */
const SERIALIZD_STALE_MS = 5 * 60_000;

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
 * Whether `provider` already records the intended watch — the input to the
 * plan 0011 reconcile rule. Reads go through the query cache (fetchQuery), so
 * repeated logs don't refetch cold state every time. A failed state read
 * counts as "doesn't have it": the write is the user's actual intent, and a
 * duplicate on a provider beats silently dropping the log.
 */
async function providerHasWatch(
  queryClient: QueryClient,
  provider: ProviderId,
  item: NormalizedMediaItem,
  episodes: Array<{ season: number; number: number }> | null,
): Promise<boolean> {
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
      return episodes == null
        ? anilistHasFilm(state.entry)
        : anilistHasEpisodes(state.entry, episodes);
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
  // Letterboxd has no readable watch state (RSS diary only) — treat as absent.
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
    const traktId = item.externalIds.trakt;
    if (traktId != null) {
      // TV logs also change this show's seasons/progress views (plan 0010).
      queryClient.invalidateQueries({
        queryKey: traktQueryKeys.showProgress(traktId),
      });
    }
  }
  if (succeeded.includes('anilist')) {
    queryClient.invalidateQueries({ queryKey: anilistQueryKeys.currentAnime() });
    // The items key derives from this one — invalidating only the derived key
    // would refetch it straight off a stale entries cache (plan 0019 U2).
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
  // Up Next is computed from Trakt/AniList watch state, so a successful log to
  // either must recompute the sections — not just the per-show progress the
  // branches above refresh. This invalidation is also the settle signal the
  // quick-log card waits on before advancing (plan 0019 KTD-6).
  if (succeeded.includes('trakt') || succeeded.includes('anilist')) {
    queryClient.invalidateQueries({ queryKey: upNextQueryKeys.inputs() });
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
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  episodes: Array<{ season: number; number: number }> | null,
): Promise<void> {
  try {
    const enriched = await enrichExternalIds(queryClient, item, connected);
    let targets = providersForLog(enriched, connected);
    if (episodes != null && episodes.some((episode) => episode.season !== 1)) {
      targets = targets.filter((provider) => provider !== 'anilist');
    }
    await all(
      Object.fromEntries(
        targets.map((provider): [ProviderId, () => Promise<boolean>] => [
          provider,
          () => providerHasWatch(queryClient, provider, enriched, episodes),
        ]),
      ),
    );
  } catch {
    // Prefetch is an optimization — a miss just means the write pays the read.
  }
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
      const item = await enrichExternalIds(queryClient, variables.item, connected);
      const episodes = intendedEpisodes(variables);

      // Defensive (plan 0022 R2/KTD-3): the sheet already excludes manual-only
      // targets (e.g. Letterboxd on web) from `variables.providers`, but a
      // caller passing one anyway must never reach the adapter for it.
      const targets = resolveLogWriteTargets(item, connected, {
        nonSeasonOneEpisodes:
          episodes != null && episodes.some((episode) => episode.season !== 1),
        onlyProviders: variables.providers,
        platform: currentPlatform(),
      });
      if (targets.length === 0) {
        throw new Error(`No connected provider can log "${item.title}"`);
      }

      const recordsByProvider = await all(
        Object.fromEntries(
          targets.map(
            (provider): [ProviderId, () => Promise<ProviderWatchRecord>] => [
              provider,
              async () => ({
                provider,
                hasIt: await providerHasWatch(queryClient, provider, item, episodes),
              }),
            ],
          ),
        ),
      );
      // better-all keys its result in completion order — rebuild routing order.
      const records: ProviderWatchRecord[] = targets.map(
        (provider) => recordsByProvider[provider],
      );
      const decisions = reconcileLogTargets(records);
      const writeTargets = decisions
        .filter((decision) => decision.action !== 'skip')
        .map((decision) => decision.provider);
      const skipped = decisions
        .filter((decision) => decision.action === 'skip')
        .map((decision) => decision.provider);
      const rewatch = decisions.every((decision) => decision.action === 'rewatch');

      const result = await fanOutLog(LOG_ADAPTERS, writeTargets, {
        ...variables,
        item,
        rewatch,
      });

      invalidateAfterLog(queryClient, item, result.succeeded);

      // Merge skips back so the caller sees one outcome per applicable
      // provider, in routing order (partial-failure contract, AGENTS.md).
      const outcomes: ProviderLogOutcome[] = decisions.map((decision) =>
        decision.action === 'skip'
          ? { provider: decision.provider, status: 'skipped' }
          : (result.outcomes.find((o) => o.provider === decision.provider) ?? {
              provider: decision.provider,
              status: 'error',
              message: 'missing outcome',
            }),
      );

      return { ...result, outcomes, skipped };
    },
  });
}
