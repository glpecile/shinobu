import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { currentPlatform } from '@/features/log-media/use-log-targets';
import { watchlistSourcesFor } from '@/features/watchlist/use-is-watchlisted';
import {
  subscribeWatchlistInputs,
  watchlistQueryKeys,
  type WatchlistInputs,
} from '@/state/queries/watchlist';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { shouldOfferWatchlistAdd } from './remove-targets';

/** Cache-only (never fetches); returns `false` when the watchlist cache is cold or membership is unknown. */
export function useWatchlistAddStillOffered(item: NormalizedMediaItem | undefined): boolean {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  const platform = currentPlatform();

  return useSyncExternalStore(
    (onStoreChange) => subscribeWatchlistInputs(queryClient, onStoreChange),
    () => {
      if (item == null) return false;
      const data = queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs());
      if (data == null) return false;
      return shouldOfferWatchlistAdd(
        { item, sources: watchlistSourcesFor(data.inputs, item) },
        connected,
        platform,
        data.errors,
        data.incomplete,
      );
    },
    () => false,
  );
}
