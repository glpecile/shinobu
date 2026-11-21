import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Whether book progress reads in pages or in percent. The log sheet's unit
 * switch sets it, and the diary and Continue Reading follow it. Percent is the
 * default, the unit the log sheet shipped with.
 */
const KEY = 'readingInPages';

export function setReadingInPages(inPages: boolean): void {
  prefsStorage.set(KEY, inPages);
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener(onStoreChange);
  return () => subscription.remove();
}

/** The persisted unit, reactive, and percent during server rendering. */
export function useReadingInPages(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && prefsStorage.getBoolean(KEY) === true,
    () => false,
  );
}
