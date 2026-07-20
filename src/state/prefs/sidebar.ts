import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Whether the web sidebar is collapsed to its icon rail — persisted so the
 * choice survives reloads (the web analogue of shadcn's sidebar cookie; MMKV
 * falls back to localStorage on web). Web-only: native uses the bottom tab bar.
 */
const KEY = 'sidebarCollapsed';

export function setSidebarCollapsed(collapsed: boolean): void {
  if (collapsed) {
    prefsStorage.set(KEY, true);
  } else {
    prefsStorage.remove(KEY);
  }
}

export function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(prefsStorage.getBoolean(KEY) !== true);
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** Whether the sidebar is collapsed to icons — reactive. */
export function useSidebarCollapsed(): boolean {
  // Booleans compare by value, so no snapshot caching is needed (see
  // collapsed-sections.ts for the same contract).
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && prefsStorage.getBoolean(KEY) === true,
    () => false,
  );
}
