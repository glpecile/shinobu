import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { ProviderId } from '@/lib/providers/types';
import {
  subscribeWatchlistInputs,
  watchlistQueryKeys,
  type WatchlistInputs,
} from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

import { watchlistMergeKeys } from './compute';
import type { WatchlistInput } from './types';

export function watchlistSourcesFor(
  inputs: readonly WatchlistInput[],
  item: NormalizedMediaItem,
): ProviderId[] {
  const keys = new Set(watchlistMergeKeys(item));
  const sources = new Set<ProviderId>();
  for (const input of inputs) {
    const matches =
      input.item.id === item.id ||
      (keys.size > 0 && watchlistMergeKeys(input.item).some((key) => keys.has(key)));
    if (matches) sources.add(input.source);
  }
  return [...sources];
}

function isWatchlistedIn(inputs: readonly WatchlistInput[], item: NormalizedMediaItem): boolean {
  return watchlistSourcesFor(inputs, item).length > 0;
}

/**
 * Cache-only watchlist membership (never fetches): `undefined` means the cache is cold.
 * Uses `useSyncExternalStore` because TanStack Query's `skipToken` still registers an
 * active observer that throws if the shared key is invalidated with no real observer mounted.
 */
export function useIsWatchlisted(item: NormalizedMediaItem | undefined): boolean | undefined {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onStoreChange) => subscribeWatchlistInputs(queryClient, onStoreChange),
    () => {
      if (item == null) return undefined;
      const data = queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs());
      return data == null ? undefined : isWatchlistedIn(data.inputs, item);
    },
    () => undefined,
  );
}
