import { useSyncExternalStore } from 'react';

import type { MediaSort } from '@/lib/media-sort';
import { isServer, prefsStorage } from './storage';

export type MediaSortScope = 'watchlist' | 'lists';

export function setMediaSort(scope: MediaSortScope, sort: MediaSort): void {
  prefsStorage.set(`${scope}Sort`, sort);
}

function readSort(scope: MediaSortScope): MediaSort {
  const value = isServer() ? undefined : prefsStorage.getString(`${scope}Sort`);
  switch (value) {
    case 'title-asc':
    case 'title-desc':
    case 'year-desc':
    case 'year-asc':
      return value;
    default:
      return 'default';
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** Independent standing preferences for watchlist and custom-list contents. */
export function useMediaSort(scope: MediaSortScope): MediaSort {
  return useSyncExternalStore(subscribe, () => readSort(scope), () => 'default' as const);
}
