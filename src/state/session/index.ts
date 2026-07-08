import { useSyncExternalStore } from 'react';

import type { ProviderId } from '@/lib/providers/types';
import {
  clearProviderSession,
  connectedProviderIds,
  onSessionChange,
} from './tokens';

let cachedConnected: ProviderId[] | null = null;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function readConnected(): ProviderId[] {
  // useSyncExternalStore compares snapshots by reference — recompute only on
  // storage change (subscribe below invalidates), not on every render.
  // Lazy-initialize so importing this module on the server (SSR) does not
  // touch MMKV/localStorage before React has a chance to use the server snapshot.
  if (cachedConnected == null && !isServer()) {
    cachedConnected = connectedProviderIds();
  }
  return cachedConnected ?? [];
}

function getServerSnapshot(): ProviderId[] {
  // During server rendering there is no session state; hydration will pick up
  // the client's real tokens on the client.
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  return onSessionChange(() => {
    cachedConnected = connectedProviderIds();
    onStoreChange();
  });
}

/**
 * Which providers are currently connected (their token *is* the session —
 * AGENTS.md "Providers, Sessions & Log Fan-Out"). Reactive to MMKV changes,
 * so OAuth completion anywhere in the app updates every subscriber.
 */
export function useConnectedProviders(): readonly ProviderId[] {
  return useSyncExternalStore(subscribe, readConnected, getServerSnapshot);
}

export function useDisconnectProvider(): (id: ProviderId) => void {
  return (id: ProviderId) => {
    clearProviderSession(id);
  };
}
