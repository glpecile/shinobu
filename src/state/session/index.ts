import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { clearSimklAuthFlow } from '@/lib/providers/simkl/auth-flow';
import type { ProviderId } from '@/lib/providers/types';
import { DIARY_QUERY_ROOT } from '@/state/queries/diary-pages';
import { UP_NEXT_QUERY_ROOT } from '@/state/queries/up-next-cache';
import { WATCHLIST_QUERY_ROOT } from '@/state/queries/watchlist-cache';
import {
  clearProviderSession,
  connectedProviderIds,
  getProviderSession,
  onSessionChange,
  PROVIDER_KEY_PATTERN,
} from './tokens';
import { traktNeedsCredentials, usableProviderIds } from './trakt-migration';

export {
  providerIsUsable,
  traktNeedsCredentials,
  usableProviderIds,
} from './trakt-migration';

let cachedConnected: ProviderId[] | null = null;

/** What `useConnectedProviders` returns while the prerendered web page hydrates. */
export const SERVER_CONNECTED_PROVIDERS: ProviderId[] = [];

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
  return cachedConnected ?? SERVER_CONNECTED_PROVIDERS;
}

function getServerSnapshot(): ProviderId[] {
  // During server rendering there is no session state; hydration will pick up
  // the client's real tokens on the client.
  return SERVER_CONNECTED_PROVIDERS;
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
 * The usable providers at call time, for a fetch. A connect invalidates the
 * active gathers (`syncQueryCacheWithSessions`) before React re-renders them,
 * so a list captured at render would refetch without the new provider.
 * Usable, not merely connected: a MigrationNeeded Trakt session can only 401.
 * Prerendering has no storage and reads the hook's server snapshot.
 */
export function currentUsableProviders(): readonly ProviderId[] {
  return isServer() ? SERVER_CONNECTED_PROVIDERS : usableProviderIds();
}

/** Every cache a provider's session backs: its own root and the merged gathers. */
export function purgeProviderQueries(queryClient: QueryClient, id: ProviderId): void {
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
  // The third exception: the unified diary's key names the provider set and
  // two usernames, not the Trakt/AniList/Simkl account, and it is persisted
  // on native. Reconnecting as another account must not restore it.
  queryClient.removeQueries({ queryKey: [...DIARY_QUERY_ROOT] });
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
  purgeProviderQueries(queryClient, id);
}

/**
 * Keeps the query cache in step with the session store for changes the
 * Disconnect button doesn't make: a provider clearing a dead token purges like
 * a disconnect; a fresh connect marks the merged gathers stale so the new
 * provider's rows appear. A token refresh overwrites a live session and does
 * nothing. Returns the unsubscribe.
 */
export function syncQueryCacheWithSessions(queryClient: QueryClient): () => void {
  let known = new Set(connectedProviderIds());
  return onSessionChange((key) => {
    // `clientId.*` and `tmdbToken` share this store; only session keys count.
    const id = PROVIDER_KEY_PATTERN.exec(key)?.[1] as ProviderId | undefined;
    if (id == null) return;
    const present = getProviderSession(id) != null;
    if (!present && known.has(id)) purgeProviderQueries(queryClient, id);
    if (present && !known.has(id)) {
      void queryClient.invalidateQueries({ queryKey: [...UP_NEXT_QUERY_ROOT, 'inputs'] });
      void queryClient.invalidateQueries({ queryKey: [...WATCHLIST_QUERY_ROOT, 'inputs'] });
    }
    known = new Set(connectedProviderIds());
  });
}

export function useDisconnectProvider(): (id: ProviderId) => void {
  const queryClient = useQueryClient();
  return (id: ProviderId) => disconnectProvider(queryClient, id);
}
