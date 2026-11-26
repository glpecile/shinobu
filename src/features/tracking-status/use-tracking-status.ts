import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { runProviderWrites, type WriteAdapter } from '@/features/log-media/fan-out';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { createRefreshDeps, refreshNotifications } from '@/features/notifications/refresh';
import { invalidateAfterWatchlist } from '@/features/watchlist-media/invalidate';
import { setAniListTrackingStatus } from '@/lib/providers/anilist/writes';
import { setHardcoverTrackingStatus } from '@/lib/providers/hardcover/writes';
import { resolveWriteTargets, splitWriteTargets } from '@/lib/providers/routing';
import { setSerializdTrackingStatus } from '@/lib/providers/serializd/tracking';
import { getAllItems } from '@/lib/providers/simkl/reads';
import { setSimklTrackingStatus } from '@/lib/providers/simkl/writes';
import { Provider, type ProviderId, type TrackingStatus } from '@/lib/providers/types';
import { anilistDeps } from '@/state/queries/anilist';
import { hardcoverDeps } from '@/state/queries/hardcover';
import {
  fetchSerializdTrackingState,
  serializdDeps,
  serializdQueryKeys,
} from '@/state/queries/serializd';
import { findLibraryEntry, simklDeps } from '@/state/queries/simkl';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';

interface TrackingStatusPayload {
  item: NormalizedMediaItem;
  status: TrackingStatus;
  queryClient: QueryClient;
}

const TRACKING_ADAPTERS: Partial<Record<ProviderId, WriteAdapter<TrackingStatusPayload>>> = {
  [Provider.AniList]: ({ item, status }) =>
    Effect.runPromise(setAniListTrackingStatus(anilistDeps(), item, status)),
  [Provider.Simkl]: async ({ item, status }) => {
    const library = await Effect.runPromise(getAllItems(simklDeps(), {}));
    return Effect.runPromise(
      setSimklTrackingStatus(simklDeps(), findLibraryEntry(library, item), status),
    );
  },
  [Provider.Hardcover]: ({ item, status }) =>
    Effect.runPromise(setHardcoverTrackingStatus(hardcoverDeps(), item, status)),
  [Provider.Serializd]: async ({ item, status, queryClient }) => {
    const tmdbId = item.externalIds.tmdb;
    const current = tmdbId == null ? null : await fetchSerializdTrackingState(queryClient, tmdbId);
    return Effect.runPromise(setSerializdTrackingStatus(serializdDeps(), item, current, status));
  },
};

interface TrackingStatusVariables {
  status: TrackingStatus;
  providers: ProviderId[];
}

function trackingMutationKey(itemId: string) {
  return ['tracking-status', itemId] as const;
}

export function useIsTrackingStatusPending(itemId: string): boolean {
  return (
    useMutationState({
      filters: { mutationKey: trackingMutationKey(itemId), status: 'pending' },
    }).length > 0
  );
}

async function runTrackingStatusWrite(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  { status, providers }: TrackingStatusVariables,
) {
  const enriched = await enrichExternalIds(queryClient, item, connected);
  const platform = currentPlatform();
  const targets = resolveWriteTargets(enriched, connected, {
    capability: 'tracking',
    platform,
    onlyProviders: providers,
  });
  const { manual } = splitWriteTargets(enriched, connected, platform, 'tracking');
  if (targets.length === 0 && manual.length === 0) {
    throw new Error(`No connected provider can change the status of "${enriched.title}"`);
  }

  const report = await runProviderWrites(TRACKING_ADAPTERS, targets, {
    item: enriched,
    status,
    queryClient,
  });
  invalidateAfterWatchlist(queryClient, enriched, report.succeeded);
  const serializdUser = getSerializdUsername();
  if (serializdUser != null && report.succeeded.includes(Provider.Serializd)) {
    // Serializd leaves paused and dropped shows out of Coming Soon.
    queryClient.invalidateQueries({ queryKey: serializdQueryKeys.trackingLists(serializdUser) });
    queryClient.invalidateQueries({ queryKey: serializdQueryKeys.upcoming(serializdUser) });
  }
  if (report.succeeded.length > 0 && platform !== 'web') {
    await refreshNotifications(createRefreshDeps(queryClient), { throttle: false });
  }
  return { ...report, item: enriched, manual };
}

export function useTrackingStatus(item: NormalizedMediaItem) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: trackingMutationKey(item.id),
    mutationFn: (variables: TrackingStatusVariables) =>
      runTrackingStatusWrite(queryClient, item, connected, variables),
  });
}
