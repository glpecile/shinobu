import { useSyncExternalStore } from 'react';

import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '@/features/notifications/compute-schedule';

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

/**
 * Per-kind mutes under the opt-in above. Absent means on, so a kind added
 * later starts enabled.
 */
const MUTED_PREFIX = 'notifications.muted.';

export function getMutedNotificationKinds(): Set<NotificationKind> {
  return new Set(
    NOTIFICATION_KINDS.map(({ kind }) => kind).filter(
      (kind) => prefsStorage.getString(`${MUTED_PREFIX}${kind}`) === 'true',
    ),
  );
}

export function setNotificationKindMuted(kind: NotificationKind, muted: boolean): void {
  if (muted) prefsStorage.set(`${MUTED_PREFIX}${kind}`, 'true');
  else prefsStorage.remove(`${MUTED_PREFIX}${kind}`);
}

function subscribeMuted(onStoreChange: () => void): () => void {
  const subscription = prefsStorage.addOnValueChangedListener((key) => {
    if (key.startsWith(MUTED_PREFIX)) onStoreChange();
  });
  return () => subscription.remove();
}

/** Reactive read of one kind's toggle, for the settings screen. */
export function useNotificationKindEnabled(kind: NotificationKind): boolean {
  return useSyncExternalStore(
    subscribeMuted,
    () => isServer() || prefsStorage.getString(`${MUTED_PREFIX}${kind}`) !== 'true',
    () => true,
  );
}
