import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Which home-feed rows the user has collapsed — persisted so the choice
 * survives app restarts. Keyed by a stable section slug (not the display
 * title: the seasonal anime row's title changes every cour).
 */
const keyFor = (sectionKey: string) => `collapsedSection.${sectionKey}`;

export function setSectionCollapsed(
  sectionKey: string,
  collapsed: boolean,
): void {
  prefsStorage.set(keyFor(sectionKey), collapsed);
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** Whether one section is collapsed — reactive across the app. Unset reads `defaultCollapsed`. */
export function useSectionCollapsed(sectionKey: string, defaultCollapsed = false): boolean {
  // Booleans compare by value, so no snapshot caching is needed here (unlike
  // the array-snapshot stores in this directory).
  return useSyncExternalStore(
    subscribe,
    () => (isServer() ? defaultCollapsed : prefsStorage.getBoolean(keyFor(sectionKey)) ?? defaultCollapsed),
    () => defaultCollapsed,
  );
}
