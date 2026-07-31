import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { clearSimklAuthFlow } from '@/lib/providers/simkl/auth-flow';
import type { ProviderId } from '@/lib/providers/types';
import { UP_NEXT_QUERY_ROOT } from '@/state/queries/up-next-cache';
import { WATCHLIST_QUERY_ROOT } from '@/state/queries/watchlist-cache';
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

/**
 * The disconnect itself, extracted from the hook so the purge contract is
 * testable without React (plan 0034 U5 added the Simkl leg).
 */
export function disconnectProvider(queryClient: QueryClient, id: ProviderId): void {
  clearProviderSession(id);
  if (id === 'simkl') {
    // A pending PKCE verifier/state pair is scoped to a connect attempt, not
    // a session — but disconnecting mid-flow must not leave material around
    // that would validate some future stray code (plan 0034 U5).
    clearSimklAuthFlow();
  }
  // Drop the provider's cached reads with its session — every provider's
  // query-key root is its id. Reconnecting (possibly as a different account)
  // must not serve the old account's data; the AniList viewer id is even
  // cached forever (state/queries/anilist.ts).
  queryClient.removeQueries({ queryKey: [id] });
  // Up Next is the exception to "every root is a provider id": it merges both
  // providers under one key, so the line above can't reach it and its entry
  // is persisted to disk (state/queries/up-next-cache.ts explains why here).
  queryClient.removeQueries({ queryKey: [...UP_NEXT_QUERY_ROOT] });
  // The second exception, for the same reason (plan 0031 U13): the merged
  // watchlist holds every provider's rows under one key that names none of
  // them. Without this, disconnecting Trakt leaves that account's rows on the
  // surface for the whole stale window — and on disk, since it is persisted.
  queryClient.removeQueries({ queryKey: [...WATCHLIST_QUERY_ROOT] });
}

export function useDisconnectProvider(): (id: ProviderId) => void {
  const queryClient = useQueryClient();
  return (id: ProviderId) => disconnectProvider(queryClient, id);
}
