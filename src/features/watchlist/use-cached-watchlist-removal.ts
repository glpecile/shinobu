import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

import {
  findWatchlistRemoval,
  type WatchlistRemovalTarget,
} from './find-watchlist-removal';

/**
 * The merged `WatchlistEntry` for `item` out of the gathered cache, or `null`
 * when nothing there holds it — the hook form of `findWatchlistRemoval`, so a
 * surface that only has an item can still offer the removal (plan 0033
 * follow-up, generalized to the card-actions sheet on 2026-08-01 after a
 * fully-watchlisted feed card rendered a disabled "On your watchlist" row with
 * nothing to press).
 *
 * **This does not weaken R35.** The rule is that a removal must route off
 * evidence of which providers hold the item, never off the item alone. That
 * evidence is the gather, and this reads exactly the gather — `sources`,
 * `errors` and `incomplete` all arrive intact. A cold cache or an unheld item
 * is `null`, so a surface that has no evidence still offers nothing. What the
 * rule was never about is *which screen* you happen to be standing on.
 *
 * Cache-only and **never fetches**, per `useIsWatchlisted`'s discipline (one
 * key, one queryFn; an item-level membership read is the per-card N+1 KTD-3
 * rejected). The subscription's snapshot is the cached `WatchlistInputs`
 * reference — stable between query updates, so `useSyncExternalStore` cannot
 * loop on it — and the merge runs in render, gated on `enabled` because
 * `computeWatchlist` is a full pass over every gathered row and the sheet stays
 * mounted while closed.
 */
export function useCachedWatchlistRemoval(
  item: NormalizedMediaItem | null,
  enabled: boolean,
): WatchlistRemovalTarget | null {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();

  const data = useSyncExternalStore(
    (onStoreChange) => cache.subscribe(() => onStoreChange()),
    () => queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs()),
    // Web SSR has no cache to read — the same "unknown, so offer nothing"
    // answer `useIsWatchlisted` gives.
    () => undefined,
  );

  if (!enabled || item == null || data == null) return null;
  return findWatchlistRemoval(data, item);
}
