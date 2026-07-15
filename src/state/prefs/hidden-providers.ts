import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import type { ProviderId } from '@/lib/providers/types';

/**
 * Local-only UI preferences. Deliberately a separate MMKV file from
 * `state/session` — hiding a provider card is cosmetic and must never touch
 * auth state; disconnect/reconnect flows leave it alone.
 */
const storage = createMMKV({ id: 'prefs' });

const keyFor = (id: ProviderId) => `hiddenProvider.${id}`;
const HIDDEN_KEY_PATTERN = /^hiddenProvider\.(.+)$/;

export function hiddenProviderIds(): ProviderId[] {
  return storage
    .getAllKeys()
    .map((key) => HIDDEN_KEY_PATTERN.exec(key)?.[1])
    .filter((id): id is ProviderId => id != null);
}

export function setProviderHidden(id: ProviderId, hidden: boolean): void {
  if (hidden) {
    storage.set(keyFor(id), 'true');
  } else {
    storage.remove(keyFor(id));
  }
}

let cachedHidden: ProviderId[] | null = null;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function readHidden(): ProviderId[] {
  // Same snapshot-caching + SSR-lazy contract as state/session/index.ts:
  // useSyncExternalStore compares by reference, and MMKV/localStorage must not
  // be touched during server rendering.
  if (cachedHidden == null && !isServer()) {
    cachedHidden = hiddenProviderIds();
  }
  return cachedHidden ?? [];
}

function getServerSnapshot(): ProviderId[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  const subscription = storage.addOnValueChangedListener(() => {
    cachedHidden = hiddenProviderIds();
    onStoreChange();
  });
  return () => subscription.remove();
}

/** Providers the user chose to hide from the Manage Trackers list — reactive. */
export function useHiddenProviders(): readonly ProviderId[] {
  return useSyncExternalStore(subscribe, readHidden, getServerSnapshot);
}
