import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { providersForLog } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { logToTrakt } from '@/lib/providers/trakt/writes';
import { traktDeps, traktQueryKeys } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import {
  fanOutLog,
  type LogAdapter,
  type LogMediaResult,
  type LogMediaVariables,
} from './fan-out';

/**
 * One entry per write-capable provider; AniList (todos/002) and Letterboxd
 * (todos/004) land by adding theirs. `Effect.runPromise` here is the same
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
    ),
};

/**
 * The unified log fan-out (plan 0008, todos/005): routes to every connected
 * provider applicable to the item and fires the writes in parallel — never a
 * single-provider write (AGENTS.md). Resolves with per-provider outcomes;
 * throws only when no connected provider applies at all.
 */
export function useLogMedia() {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: LogMediaVariables): Promise<LogMediaResult> => {
      const targets = providersForLog(variables.item, connected);
      if (targets.length === 0) {
        throw new Error(
          `No connected provider can log "${variables.item.title}"`,
        );
      }
      return fanOutLog(LOG_ADAPTERS, targets, variables);
    },
    onSuccess: (result, variables) => {
      // The write changed watch history — refresh the reads that show it.
      if (result.succeeded.includes('trakt')) {
        queryClient.invalidateQueries({
          queryKey: traktQueryKeys.watchedShows(),
        });
        queryClient.invalidateQueries({
          queryKey: traktQueryKeys.watchedMovies(),
        });
        // TV logs also change this show's seasons/progress views (plan 0010).
        const traktId = variables.item.externalIds.trakt;
        if (traktId != null) {
          queryClient.invalidateQueries({
            queryKey: traktQueryKeys.showProgress(traktId),
          });
        }
      }
    },
  });
}
