import { useSyncExternalStore } from 'react';

import { isServer, prefsStorage } from './storage';

/**
 * Release-notifications opt-in (plan 0020 R8). Default off — enabling goes
 * through the OS permission prompt before this flips true (state/notifications
 * settings UI), so the pref alone never implies the OS actually granted it.
 */

const ENABLED_KEY = 'notifications.enabled';

export function getNotificationsEnabled(): boolean {
  return prefsStorage.getString(ENABLED_KEY) === 'true';
}

export function setNotificationsEnabled(enabled: boolean): void {
  prefsStorage.set(ENABLED_KEY, enabled ? 'true' : 'false');
}

let cachedEnabled: boolean | null = null;

function readEnabled(): boolean {
  if (cachedEnabled == null && !isServer()) {
    cachedEnabled = getNotificationsEnabled();
  }
  return cachedEnabled ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener((key) => {
    if (key !== ENABLED_KEY) return;
    cachedEnabled = getNotificationsEnabled();
    onStoreChange();
  });
  return () => subscription.remove();
}

/** Reactive read of the toggle, for the settings screen. */
export function useNotificationsEnabled(): boolean {
  return useSyncExternalStore(subscribe, readEnabled, getServerSnapshot);
}
