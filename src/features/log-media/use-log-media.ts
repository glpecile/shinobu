import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { logToAniList } from '@/lib/providers/anilist/writes';
import { providersForLog } from '@/lib/providers/routing';
import { getShowWatchedProgress, getWatchedMovies } from '@/lib/providers/trakt/reads';
import { logToTrakt } from '@/lib/providers/trakt/writes';
import type { ProviderId } from '@/lib/providers/types';
import { anilistDeps, anilistQueryKeys } from '@/state/queries/anilist';
import { getEntryState } from '@/lib/providers/anilist/reads';
import { traktDeps, traktQueryKeys } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';
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
  type ProviderLogOutcome,
} from './fan-out';

/**
 * One entry per write-capable provider; Letterboxd (todos/004) lands by
 * adding its entry. `Effect.runPromise` here is the same containment
 * boundary `state/queries/*` uses — no Effect type escapes.
 */
const LOG_ADAPTERS: Partial<Record<ProviderId, LogAdapter>> = {
  trakt: ({ item, episode, episodes, watchedAt }) =>
    Effect.runPromise(
      logToTrakt(traktDeps(), item, {
        ...(episode != null ? { episode } : {}),
        ...(episodes != null ? { episodes } : {}),
        ...(watchedAt != null ? { watchedAt } : {}),
      }),
    ),
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
    ),
};

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
      const completed = await queryClient.fetchQuery({
        queryKey: traktQueryKeys.showProgress(traktId),
        queryFn: () =>
          Effect.runPromise(getShowWatchedProgress(traktDeps(), { traktId })),
      });
      return traktHasEpisodes(completed, episodes);
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
  } catch {
    return false;
  }
  // Providers without a state read yet (Letterboxd) always attempt the write.
  return false;
}

function invalidateAfterLog(
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
    const mediaId = item.externalIds.anilist;
    if (mediaId != null) {
      queryClient.invalidateQueries({
        queryKey: anilistQueryKeys.entryState(mediaId),
      });
    }
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

      let targets = providersForLog(item, connected);
      // Single-season scope (plan 0011): an AniList entry can only represent
      // season 1 of a mapped TV show — season 2+ logs stay off AniList.
      if (episodes != null && episodes.some((episode) => episode.season !== 1)) {
        targets = targets.filter((provider) => provider !== 'anilist');
      }
      if (variables.providers != null && variables.providers.length > 0) {
        targets = targets.filter((provider) => variables.providers!.includes(provider));
      }
      if (targets.length === 0) {
        throw new Error(`No connected provider can log "${item.title}"`);
      }

      const records: ProviderWatchRecord[] = await Promise.all(
        targets.map(async (provider) => ({
          provider,
          hasIt: await providerHasWatch(queryClient, provider, item, episodes),
        })),
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
