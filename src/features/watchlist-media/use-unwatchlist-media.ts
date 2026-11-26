import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import {
  runProviderWrites,
  type ProviderWriteReport,
  type WriteAdapter,
} from '@/features/log-media/fan-out';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import {
  createRefreshDeps,
  refreshNotifications,
  type RefreshOptions,
} from '@/features/notifications/refresh';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { deleteAniListEntry } from '@/lib/providers/anilist/writes';
import { removeFromLetterboxdWatchlist } from '@/lib/providers/letterboxd/watchlist-writes';
import { removeFromHardcoverReadingList } from '@/lib/providers/hardcover/writes';
import { removeFromSimklWatchlist } from '@/lib/providers/simkl/writes';
import { removeFromTraktWatchlist } from '@/lib/providers/trakt/writes';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { anilistDeps } from '@/state/queries/anilist';
import { letterboxdDeps } from '@/state/queries/letterboxd';
import type { ProviderFailure } from '@/state/queries/settle';
import { hardcoverDeps } from '@/state/queries/hardcover';
import { simklDeps } from '@/state/queries/simkl';
import { traktDeps } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { invalidateAfterWatchlist, shouldRefreshNotifications } from './invalidate';
import {
  planWatchlistRemove,
  type UnwatchlistMediaVariables,
  type WatchlistRemovePayload,
} from './remove-targets';

// Simkl's `/sync/history/remove` deletes plan-to-watch, watch history, and rating together.
export const WATCHLIST_REMOVE_ADAPTERS: Partial<
  Record<ProviderId, WriteAdapter<WatchlistRemovePayload>>
> = {
  trakt: ({ item }) => Effect.runPromise(removeFromTraktWatchlist(traktDeps(), item)),
  letterboxd: ({ item }) =>
    Effect.runPromise(removeFromLetterboxdWatchlist(letterboxdDeps(), item)),
  simkl: ({ item, destructive }) =>
    Effect.runPromise(
      removeFromSimklWatchlist(
        simklDeps(),
        item,
        destructive?.includes(Provider.Simkl) === true ? { allowDestructive: true } : {},
      ),
    ),
  hardcover: ({ item }) => Effect.runPromise(removeFromHardcoverReadingList(hardcoverDeps(), item)),
  anilist: ({ item, destructive }) => {
    const mediaId = item.externalIds.anilist;
    if (mediaId == null) {
      return Promise.resolve({
        status: 'skipped' as const,
        reason: 'has no AniList id to remove by',
      });
    }
    return Effect.runPromise(
      deleteAniListEntry(anilistDeps(), {
        mediaId,
        ...(destructive?.includes(Provider.AniList) === true ? { allowDestructive: true } : {}),
      }),
    );
  },
};

export type UnwatchlistMediaResult = ProviderWriteReport & {
  item: NormalizedMediaItem;
  manual: ProviderId[];
  unknown: ProviderId[];
};

export interface WatchlistRemoveDeps {
  adapters: Partial<Record<ProviderId, WriteAdapter<WatchlistRemovePayload>>>;
  refresh: (queryClient: QueryClient, options: RefreshOptions) => Promise<void>;
}

export const watchlistRemoveDeps = (): WatchlistRemoveDeps => ({
  adapters: WATCHLIST_REMOVE_ADAPTERS,
  refresh: (queryClient, options) => refreshNotifications(createRefreshDeps(queryClient), options),
});

const WATCHLIST_REMOVE_MUTATION_ROOT = ['watchlist-media-remove'] as const;

function watchlistRemoveMutationKey(itemId: string) {
  return [...WATCHLIST_REMOVE_MUTATION_ROOT, itemId] as const;
}

function watchlistRemovePendingFilter(itemId: string) {
  return {
    mutationKey: watchlistRemoveMutationKey(itemId),
    status: 'pending',
  } as const;
}

export function useIsUnwatchlistPending(itemId: string): boolean {
  return useMutationState({ filters: watchlistRemovePendingFilter(itemId) }).length > 0;
}

export function useLatestUnwatchlistResult(itemId: string): UnwatchlistMediaResult | undefined {
  const results = useMutationState({
    filters: { mutationKey: watchlistRemoveMutationKey(itemId) },
    select: (mutation) => mutation.state.data as UnwatchlistMediaResult | undefined,
  });
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result != null) return result;
  }
  return undefined;
}

export async function runWatchlistRemove(
  queryClient: QueryClient,
  entry: WatchlistEntry,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[] = [],
  variables: UnwatchlistMediaVariables = {},
  deps: WatchlistRemoveDeps = watchlistRemoveDeps(),
  incomplete: readonly ProviderId[] = [],
): Promise<UnwatchlistMediaResult> {
  const plan = await planWatchlistRemove(
    queryClient,
    entry,
    connected,
    errors,
    variables,
    incomplete,
  );
  if (plan.targets.length === 0 && plan.manual.length === 0 && plan.unknown.length === 0) {
    throw new Error(`No connected provider can remove "${plan.item.title}"`);
  }

  const report = await runProviderWrites(deps.adapters, plan.targets, {
    item: plan.item,
    ...(variables.destructive != null ? { destructive: variables.destructive } : {}),
  });

  invalidateAfterWatchlist(queryClient, plan.item, report.succeeded);

  if (report.succeeded.length > 0 && shouldRefreshNotifications(plan.item, currentPlatform())) {
    await deps.refresh(queryClient, { throttle: false });
  }

  return {
    ...report,
    item: plan.item,
    manual: plan.manual,
    unknown: plan.unknown,
  };
}

export function useUnwatchlistMedia(
  entry: WatchlistEntry,
  errors: readonly ProviderFailure[] = [],
  incomplete: readonly ProviderId[] = [],
) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: watchlistRemoveMutationKey(entry.item.id),
    mutationFn: (variables: UnwatchlistMediaVariables): Promise<UnwatchlistMediaResult> =>
      runWatchlistRemove(
        queryClient,
        entry,
        connected,
        errors,
        variables,
        watchlistRemoveDeps(),
        incomplete,
      ),
  });
}
