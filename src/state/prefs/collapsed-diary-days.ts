import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Which diary days the user minimized (tapped the day header to collapse) —
 * persisted so a collapsed day stays collapsed across restarts. Keyed by the
 * day's stable local `YYYY-MM-DD` key, never the header label: "Today" rolls
 * over to a date, but the underlying day key is immutable.
 *
 * A set-valued store (like `hidden-items.ts`), not the per-key boolean of
 * `collapsed-sections.ts`, because the diary flattener needs the whole set at
 * once to decide which days' rows to omit — it can't call a hook per day.
 */
const KEY_PREFIX = 'collapsedDiaryDay.';
const keyFor = (dayKey: string) => `${KEY_PREFIX}${dayKey}`;

const EMPTY: ReadonlySet<string> = new Set();

export function setDiaryDayCollapsed(dayKey: string, collapsed: boolean): void {
  if (collapsed) {
    prefsStorage.set(keyFor(dayKey), true);
  } else {
    prefsStorage.remove(keyFor(dayKey));
  }
}

function readCollapsedDays(): ReadonlySet<string> {
  return new Set(
    prefsStorage
      .getAllKeys()
      .filter((key) => key.startsWith(KEY_PREFIX))
      .map((key) => key.slice(KEY_PREFIX.length)),
  );
}

let cached: ReadonlySet<string> | null = null;

function getSnapshot(): ReadonlySet<string> {
  // Same snapshot-caching + SSR-lazy contract as hidden-items.ts:
  // useSyncExternalStore compares by reference, and MMKV/localStorage must
  // not be touched during server rendering.
  if (cached == null && !isServer()) {
    cached = readCollapsedDays();
  }
  return cached ?? EMPTY;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(() => {
    cached = readCollapsedDays();
    onStoreChange();
  });
  return () => subscription.remove();
}

/** The set of minimized diary day keys — reactive across restarts. */
export function useCollapsedDiaryDays(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
