import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { currentPlatform } from '@/features/log-media/use-log-targets';
import { watchlistSourcesFor } from '@/features/watchlist/use-is-watchlisted';
import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { shouldOfferWatchlistAdd } from './remove-targets';

/**
 * Whether an add is still worth offering for `item`: some applicable connected
 * provider is not holding it **and** has a healthy read leg to have proven that
 * (plan 0031 R12 as amended, R35). The per-provider counterpart of
 * `useIsWatchlisted`, and the reason it exists (owner report 2026-08-01):
 * membership is not one boolean. A film removed from the Simkl watchlist while
 * still on the Letterboxd one is *on a watchlist* and *missing from a
 * watchlist* at the same time, and only the second fact decides whether the CTA
 * has anything left to do.
 *
 * **R35 is why this returns `false` on doubt rather than `true`.** A cold cache
 * (`undefined`), an errored leg or a partially-read one all mean the provider's
 * membership is *unknown*, and offering "Add to watchlist" against an unknown is
 * the app asserting non-membership it cannot evidence — the same claim
 * `hasWatchlistReadLeg` refuses on the removal side. The CTA keeps its settled
 * label there and the removal picker's unknown-membership rows stay the honest
 * surface for it.
 *
 * Cache-only and **never fetches**, for the reasons spelled out on
 * `useIsWatchlisted`: one key, one queryFn, and an item-level membership read is
 * the per-card N+1 KTD-3 rejected. Same plain-subscription shape, and the
 * snapshot is a primitive so `useSyncExternalStore` cannot loop on identity.
 */
export function useWatchlistAddStillOffered(
  item: NormalizedMediaItem | undefined,
): boolean {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  const connected = useConnectedProviders();
  const platform = currentPlatform();

  return useSyncExternalStore(
    (onStoreChange) => cache.subscribe(() => onStoreChange()),
    () => {
      if (item == null) return false;
      const data = queryClient.getQueryData<WatchlistInputs>(
        watchlistQueryKeys.inputs(),
      );
      if (data == null) return false;
      return shouldOfferWatchlistAdd(
        { item, sources: watchlistSourcesFor(data.inputs, item) },
        connected,
        platform,
        data.errors,
        data.incomplete,
      );
    },
    // Web SSR has no cache to read — the same "unknown, so behave as today"
    // answer `useIsWatchlisted` gives.
    () => false,
  );
}
