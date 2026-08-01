import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Whether `/watchlist` renders as the poster wall or as a list — persisted on
 * device (owner, 2026-08-01), unlike the provider filter, which lives in the
 * URL so it can be deep-linked and shared.
 *
 * The asymmetry is the point: a filter answers "what am I looking at right
 * now" and should reset when you arrive fresh, while grid-vs-list is a
 * standing preference about how you like to read a list at all. One is state,
 * the other is taste.
 *
 * Grid is the default — the wall is what the surface shipped as.
 */
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
