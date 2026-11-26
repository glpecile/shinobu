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
import { planOnAniList } from '@/lib/providers/anilist/writes';
import { addToLetterboxdWatchlist } from '@/lib/providers/letterboxd/watchlist-writes';
import { addToSerializdWatchlist } from '@/lib/providers/serializd/writes';
import { addToHardcoverReadingList } from '@/lib/providers/hardcover/writes';
import { addToSimklWatchlist } from '@/lib/providers/simkl/writes';
import { addToTraktWatchlist } from '@/lib/providers/trakt/writes';
import type { ProviderId } from '@/lib/providers/types';
import { anilistDeps } from '@/state/queries/anilist';
import { letterboxdDeps } from '@/state/queries/letterboxd';
import { serializdDeps } from '@/state/queries/serializd';
import { hardcoverDeps } from '@/state/queries/hardcover';
import { simklDeps } from '@/state/queries/simkl';
import { traktDeps } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { invalidateAfterWatchlist, shouldRefreshNotifications } from './invalidate';
import {
  planWatchlistWrite,
  type WatchlistMediaVariables,
  type WatchlistWritePayload,
} from './targets';

export const WATCHLIST_ADAPTERS: Partial<Record<ProviderId, WriteAdapter<WatchlistWritePayload>>> =
  {
    trakt: ({ item }) => Effect.runPromise(addToTraktWatchlist(traktDeps(), item)),
    anilist: ({ item }) => Effect.runPromise(planOnAniList(anilistDeps(), item)),
    letterboxd: ({ item }) => Effect.runPromise(addToLetterboxdWatchlist(letterboxdDeps(), item)),
    serializd: ({ item }) => Effect.runPromise(addToSerializdWatchlist(serializdDeps(), item)),
    simkl: ({ item }) => Effect.runPromise(addToSimklWatchlist(simklDeps(), item)),
    hardcover: ({ item }) => Effect.runPromise(addToHardcoverReadingList(hardcoverDeps(), item)),
  };

export type WatchlistMediaResult = ProviderWriteReport & {
  item: NormalizedMediaItem;
  manual: ProviderId[];
};

export interface WatchlistWriteDeps {
  adapters: Partial<Record<ProviderId, WriteAdapter<WatchlistWritePayload>>>;
  refresh: (queryClient: QueryClient, options: RefreshOptions) => Promise<void>;
}

export const watchlistWriteDeps = (): WatchlistWriteDeps => ({
  adapters: WATCHLIST_ADAPTERS,
  refresh: (queryClient, options) => refreshNotifications(createRefreshDeps(queryClient), options),
});

const WATCHLIST_MUTATION_ROOT = ['watchlist-media'] as const;

function watchlistMutationKey(itemId: string) {
  return [...WATCHLIST_MUTATION_ROOT, itemId] as const;
}

function watchlistPendingFilter(itemId: string) {
  return { mutationKey: watchlistMutationKey(itemId), status: 'pending' } as const;
}

export function useIsWatchlistWritePending(itemId: string): boolean {
  return useMutationState({ filters: watchlistPendingFilter(itemId) }).length > 0;
}

export function useLatestWatchlistResult(itemId: string): WatchlistMediaResult | undefined {
  const results = useMutationState({
    filters: { mutationKey: watchlistMutationKey(itemId) },
    select: (mutation) => mutation.state.data as WatchlistMediaResult | undefined,
  });
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result != null) return result;
  }
  return undefined;
}

export async function runWatchlistWrite(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  variables: WatchlistMediaVariables = {},
  deps: WatchlistWriteDeps = watchlistWriteDeps(),
): Promise<WatchlistMediaResult> {
  const plan = await planWatchlistWrite(queryClient, item, connected, variables);
  if (plan.targets.length === 0 && plan.manual.length === 0) {
    throw new Error(`No connected provider can watchlist "${plan.item.title}"`);
  }

  const report = await runProviderWrites(deps.adapters, plan.targets, {
    item: plan.item,
  });

  invalidateAfterWatchlist(queryClient, plan.item, report.succeeded);

  if (report.succeeded.length > 0 && shouldRefreshNotifications(plan.item, currentPlatform())) {
    await deps.refresh(queryClient, { throttle: false });
  }

  return { ...report, item: plan.item, manual: plan.manual };
}

export function useWatchlistMedia(item: NormalizedMediaItem) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: watchlistMutationKey(item.id),
    mutationFn: (variables: WatchlistMediaVariables): Promise<WatchlistMediaResult> =>
      runWatchlistWrite(queryClient, item, connected, variables),
  });
}
