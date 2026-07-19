import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Individual feed items the user hid (long-press on a card). Stored as
 * `hiddenItem.<NormalizedMediaItem.id>` → title, so the Manage Trackers
 * unhide list can name each entry without refetching it. Ids are
 * provider-scoped (`trakt-123`, `letterboxd-slug`), so hiding a card hides
 * that provider's copy — which is also the only copy the feed shows.
 */
export interface HiddenItem {
  id: string;
  title: string;
}

const KEY_PREFIX = 'hiddenItem.';
const keyFor = (id: string) => `${KEY_PREFIX}${id}`;

export function hideItem(item: HiddenItem): void {
  prefsStorage.set(keyFor(item.id), item.title);
}

export function unhideItem(id: string): void {
  prefsStorage.remove(keyFor(id));
}

function readHiddenItems(): HiddenItem[] {
  return prefsStorage
    .getAllKeys()
    .filter((key) => key.startsWith(KEY_PREFIX))
    .map((key) => ({
      id: key.slice(KEY_PREFIX.length),
      title: prefsStorage.getString(key) ?? '',
    }));
}

let cachedHidden: HiddenItem[] | null = null;

function getSnapshot(): HiddenItem[] {
  // Same snapshot-caching + SSR-lazy contract as state/session/index.ts:
  // useSyncExternalStore compares by reference, and MMKV/localStorage must
  // not be touched during server rendering.
  if (cachedHidden == null && !isServer()) {
    cachedHidden = readHiddenItems();
  }
  return cachedHidden ?? [];
}

function getServerSnapshot(): HiddenItem[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(() => {
    cachedHidden = readHiddenItems();
    onStoreChange();
  });
  return () => subscription.remove();
}

/** Every hidden feed item, for filtering and the unhide list — reactive. */
export function useHiddenItems(): readonly HiddenItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * `items` minus the ones the user hid (card actions dialog). The per-row
 * counterpart to `useUnifiedFeed`'s aggregate filter — each suspense-backed
 * feed row applies it to its own query result, so screens never re-filter.
 */
export function useVisibleItems<T extends { id: string }>(
  items: readonly T[],
): T[] {
  const hiddenItems = useHiddenItems();
  if (hiddenItems.length === 0) return items.slice();
  const hiddenIds = new Set(hiddenItems.map((hidden) => hidden.id));
  return items.filter((item) => !hiddenIds.has(item.id));
}
