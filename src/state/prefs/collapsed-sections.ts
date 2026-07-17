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
  if (collapsed) {
    prefsStorage.set(keyFor(sectionKey), true);
  } else {
    prefsStorage.remove(keyFor(sectionKey));
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** Whether one feed section is collapsed — reactive across the app. */
export function useSectionCollapsed(sectionKey: string): boolean {
  // Booleans compare by value, so no snapshot caching is needed here (unlike
  // the array-snapshot stores in this directory).
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && prefsStorage.getBoolean(keyFor(sectionKey)) === true,
    () => false,
  );
}
