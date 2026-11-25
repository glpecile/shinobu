import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  subscribeWatchlistInputs,
  watchlistQueryKeys,
  type WatchlistInputs,
} from '@/state/queries/watchlist';
import { useMangaListQuery } from '@/state/queries/anilist';
import type { NormalizedMediaItem } from '@/types/media';

import {
  findWatchlistRemoval,
  type WatchlistRemovalTarget,
} from './find-watchlist-removal';

/** Cache-only (never fetches); returns `null` when disabled, cold, or unheld. */
export function useCachedWatchlistRemoval(
  item: NormalizedMediaItem | null,
  enabled: boolean,
): WatchlistRemovalTarget | null {
  const queryClient = useQueryClient();
  const data = useSyncExternalStore(
    (onStoreChange) => subscribeWatchlistInputs(queryClient, onStoreChange),
    () => queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs()),
    () => undefined,
  );

  const mangaList = useMangaListQuery({ fetch: false, subscribed: enabled });

  if (!enabled || item == null || data == null) return null;
  return findWatchlistRemoval(data, item, mangaList);
}
