import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Individual feed items the user hid (long-press on a card), plus hidden
 * lists under their own prefix. Items are stored as
 * `hiddenItem.<NormalizedMediaItem.id>` → title, so the Settings
 * unhide list can name each entry without refetching it. Ids are
 * provider-scoped (`trakt-123`, `letterboxd-slug`), so hiding a card hides
 * that provider's copy — which is also the only copy the feed shows.
 */
export interface HiddenItem {
  id: string;
  title: string;
}

const KEY_PREFIX = 'hiddenItem.';
/** Lists hidden from a list card's sheet, keyed by the list's in-app href (unique across providers, and where Settings opens it). */
const LIST_PREFIX = 'hiddenList.';

export function hideItem(item: HiddenItem): void {
  prefsStorage.set(`${KEY_PREFIX}${item.id}`, item.title);
}

export function unhideItem(id: string): void {
  prefsStorage.remove(`${KEY_PREFIX}${id}`);
}

export function hideList(list: HiddenItem): void {
  prefsStorage.set(`${LIST_PREFIX}${list.id}`, list.title);
}

export function unhideList(href: string): void {
  prefsStorage.remove(`${LIST_PREFIX}${href}`);
}

function readHidden(prefix: string): HiddenItem[] {
  return prefsStorage
    .getAllKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({
      id: key.slice(prefix.length),
      title: prefsStorage.getString(key) ?? '',
    }));
}

const cache = new Map<string, HiddenItem[]>();

function snapshotOf(prefix: string): HiddenItem[] {
  // Same snapshot-caching + SSR-lazy contract as state/session/index.ts:
  // useSyncExternalStore compares by reference, and MMKV/localStorage must
  // not be touched during server rendering.
  if (!cache.has(prefix) && !isServer()) {
    cache.set(prefix, readHidden(prefix));
  }
  return cache.get(prefix) ?? [];
}

const itemsSnapshot = () => snapshotOf(KEY_PREFIX);
const listsSnapshot = () => snapshotOf(LIST_PREFIX);

function getServerSnapshot(): HiddenItem[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener((key) => {
    if (key.startsWith(KEY_PREFIX)) {
      cache.delete(KEY_PREFIX);
    } else if (key.startsWith(LIST_PREFIX)) {
      cache.delete(LIST_PREFIX);
    } else {
      return;
    }
    onStoreChange();
  });
  return () => subscription.remove();
}

/** Every hidden feed item, for filtering and the unhide list — reactive. */
export function useHiddenItems(): readonly HiddenItem[] {
  return useSyncExternalStore(subscribe, itemsSnapshot, getServerSnapshot);
}

/** Every hidden list — reactive. */
export function useHiddenLists(): readonly HiddenItem[] {
  return useSyncExternalStore(subscribe, listsSnapshot, getServerSnapshot);
}

/**
 * `items` minus `hidden`, **returning `items` itself when nothing is hidden**
 * — which is the overwhelmingly common case. A fresh array on every render
 * (the old `items.slice()`) changed identity for every downstream consumer,
 * so React Compiler's memoization could never hold and a long carousel
 * re-rendered every card on any unrelated state change (plan 0024 U7/KTD4).
 * Pure and exported so that contract is unit-testable without the store.
 */
export function visibleItems<T extends { id: string }>(
  items: readonly T[],
  hidden: readonly HiddenItem[],
): readonly T[] {
  if (hidden.length === 0) return items;
  const hiddenIds = new Set(hidden.map((entry) => entry.id));
  return items.filter((item) => !hiddenIds.has(item.id));
}

/**
 * `rows` minus the ones **any** of whose ids the user hid — `visibleItems`
 * generalized from one id per row to many (plan 0031 KTD-13).
 *
 * Why "any": hidden ids are provider-scoped (`trakt-123`, `letterboxd-slug`),
 * while a merged watchlist entry has one canonical id and several contributing
 * ones. Filtering on the canonical id alone is a real bug — a film hidden from
 * the Letterboxd row reappears in the merged grid as its Trakt twin (R30).
 *
 * **The identity contract is the stronger one**: the same array reference comes
 * back whenever the filter removed *nothing*, not merely when the hidden set is
 * empty. `visibleItems`'s weaker short-circuit would hand Up Next a fresh array
 * on every render as soon as the user hides one unrelated item anywhere,
 * re-breaking the React Compiler memoization plan 0024 KTD4 fixed on Continue
 * Watching and Calendar. Pure and exported so that is testable without the store.
 */
export function visibleByIds<T>(
  rows: readonly T[],
  hidden: readonly HiddenItem[],
  idsOf: (row: T) => readonly string[],
): T[] {
  // The cast is the identity contract itself: either the input array comes back
  // untouched, or a fresh `filter` result does.
  if (hidden.length === 0) return rows as T[];
  const hiddenIds = new Set(hidden.map((entry) => entry.id));
  const visible = rows.filter((row) => !idsOf(row).some((id) => hiddenIds.has(id)));
  return visible.length === rows.length ? (rows as T[]) : visible;
}

/**
 * `items` minus the ones the user hid (card actions dialog). The per-row
 * counterpart to `useUnifiedFeed`'s aggregate filter — each suspense-backed
 * feed row applies it to its own query result, so screens never re-filter.
 */
export function useVisibleItems<T extends { id: string }>(
  items: readonly T[],
): readonly T[] {
  return visibleItems(items, useHiddenItems());
}
