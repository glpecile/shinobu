import { useMutation, useMutationState, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { enrichExternalIds } from '@/features/log-media/enrich';
import {
  runProviderWrites,
  type WriteAdapter,
} from '@/features/log-media/fan-out';
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
import { fetchSerializdTrackingState, serializdDeps, serializdQueryKeys } from '@/state/queries/serializd';
import { findLibraryEntry, simklDeps } from '@/state/queries/simkl';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';

interface TrackingStatusPayload {
  item: NormalizedMediaItem;
  status: TrackingStatus;
  queryClient: QueryClient;
}

/**
 * One adapter per provider that declares `trackingStatus: 'write'`. Each one
 * reads the entry fresh before it writes, never from the cache: a stale
 * status could move a completed show back to paused.
 */
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
  /** Narrows the routed targets, as the picker's toggles do. */
  providers: ProviderId[];
}

function trackingMutationKey(itemId: string) {
  return ['tracking-status', itemId] as const;
}

/** Whether a pause or drop of this item is in flight anywhere in the tree. */
export function useIsTrackingStatusPending(itemId: string): boolean {
  return (
    useMutationState({
      filters: { mutationKey: trackingMutationKey(itemId), status: 'pending' },
    }).length > 0
  );
}

/**
 * Pause or drop: enrich, route to every selected provider that supports it,
 * fan out, invalidate, and reschedule notifications so a paused series stops
 * its reminders.
 */
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

  const report = await runProviderWrites(TRACKING_ADAPTERS, targets, { item: enriched, status, queryClient });
  // The watchlist's invalidation covers every key a status reads: AniList's
  // entry and current lists, Simkl's library, Hardcover's library and Up Next.
  invalidateAfterWatchlist(queryClient, enriched, report.succeeded);
  if (report.succeeded.includes(Provider.Serializd)) {
    // Serializd leaves paused and dropped shows out of Coming Soon.
    const username = getSerializdUsername() ?? '';
    queryClient.invalidateQueries({ queryKey: serializdQueryKeys.trackingLists(username) });
    queryClient.invalidateQueries({ queryKey: serializdQueryKeys.upcoming(username) });
  }
  if (report.succeeded.length > 0 && platform !== 'web') {
    await refreshNotifications(createRefreshDeps(queryClient), { throttle: false });
  }
  return { ...report, item: enriched, manual };
}

/** The pause and drop verb (#227), keyed on the item like the watchlist verbs. */
export function useTrackingStatus(item: NormalizedMediaItem) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: trackingMutationKey(item.id),
    mutationFn: (variables: TrackingStatusVariables) =>
      runTrackingStatusWrite(queryClient, item, connected, variables),
  });
}
