import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { clearSimklAuthFlow } from '@/lib/providers/simkl/auth-flow';
import type { ProviderId } from '@/lib/providers/types';
import { UP_NEXT_QUERY_ROOT } from '@/state/queries/up-next-cache';
import { WATCHLIST_QUERY_ROOT } from '@/state/queries/watchlist-cache';
import { clearProviderSession, onSessionChange } from './tokens';
import { traktNeedsCredentials, usableProviderIds } from './trakt-migration';

export {
  providerIsUsable,
  traktNeedsCredentials,
  usableProviderIds,
} from './trakt-migration';

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
    cachedConnected = usableProviderIds();
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
    // Credentials (`clientId.*`) live in the same MMKV store as sessions, so
    // saving BYO Trakt creds re-derives usability here without extra wiring.
    cachedConnected = usableProviderIds();
    onStoreChange();
  });
}

/**
 * Which providers are currently connected (their token *is* the session —
 * AGENTS.md "Providers, Sessions & Log Fan-Out") AND usable. Reactive to MMKV
 * changes, so OAuth completion anywhere in the app updates every subscriber.
 *
 * "Usable" is the plan 0034 U9 gate: a Trakt token whose client id no longer
 * resolves (MigrationNeeded — see `trakt-migration.ts`) is excluded here,
 * which is the single choke point keeping it out of every read leg (feed,
 * up-next, watchlist, diary) and the write fan-out at once. The trackers
 * screen shows the migration banner for that state instead of a dead card.
 */
export function useConnectedProviders(): readonly ProviderId[] {
  return useSyncExternalStore(subscribe, readConnected, getServerSnapshot);
}

/**
 * Reactive MigrationNeeded flag (plan 0034 R13): a stored Trakt token with no
 * resolvable client id. Drives the trackers-screen migration banner; flips
 * off the moment credentials are saved or a fresh OAuth completes (both write
 * the same MMKV store the subscription watches).
 */
export function useTraktNeedsCredentials(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && traktNeedsCredentials(),
    () => false,
  );
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
