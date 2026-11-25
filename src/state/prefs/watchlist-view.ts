import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/** Persist the watchlist view locally. Its provider filter is in the URL for sharing. */
export type WatchlistView = 'grid' | 'list';

const KEY = 'watchlistView';

export function setWatchlistView(view: WatchlistView): void {
  prefsStorage.set(KEY, view);
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** The persisted view mode — reactive, and 'grid' during server rendering. */
export function useWatchlistView(): WatchlistView {
  // A string compares by value, so no snapshot caching is needed here (unlike
  // the set-valued stores in this directory).
  return useSyncExternalStore(
    subscribe,
    () => (!isServer() && prefsStorage.getString(KEY) === 'list' ? 'list' : 'grid'),
    () => 'grid' as const,
  );
}
