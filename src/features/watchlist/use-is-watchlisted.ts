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

const indexes = new WeakMap<readonly WatchlistInput[], Map<string, number[]>>();

export function watchlistSourcesFor(
  inputs: readonly WatchlistInput[],
  item: NormalizedMediaItem,
): ProviderId[] {
  let index = indexes.get(inputs);
  if (index == null) {
    index = new Map<string, number[]>();
    for (const [position, input] of inputs.entries()) {
      for (const key of [`id:${input.item.id}`, ...watchlistMergeKeys(input.item)]) {
        const positions = index.get(key);
        if (positions == null) index.set(key, [position]);
        else positions.push(position);
      }
    }
    indexes.set(inputs, index);
  }
  const positions = [`id:${item.id}`, ...watchlistMergeKeys(item)].flatMap(
    (key) => index.get(key) ?? [],
  );
  const ordered = new Set(positions.sort((a, b) => a - b));
  const sources = new Set<ProviderId>();
  for (const position of ordered) {
    sources.add(inputs[position].source);
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
