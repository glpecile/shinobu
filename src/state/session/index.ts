import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { clearHardcoverAuthFlow } from '@/lib/providers/hardcover/auth-flow';
import { clearSimklAuthFlow } from '@/lib/providers/simkl/auth-flow';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { DIARY_QUERY_ROOT } from '@/state/queries/diary-pages';
import { revokeHardcover } from '@/state/queries/hardcover';
import { UP_NEXT_QUERY_ROOT } from '@/state/queries/up-next-cache';
import { WATCHLIST_QUERY_ROOT } from '@/state/queries/watchlist-cache';
import {
  clearProviderSession,
  connectedProviderIds,
  getProviderSession,
  onSessionChange,
  PROVIDER_KEY_PATTERN,
} from './tokens';
import {
  hardcoverListsGranted,
  hardcoverListsRefused,
  hardcoverNeedsReconnect,
  traktNeedsCredentials,
  usableProviderIds,
} from './trakt-migration';

export { providerIsUsable, traktNeedsCredentials, usableProviderIds } from './trakt-migration';

let cachedConnected: ProviderId[] | null = null;

export const SERVER_CONNECTED_PROVIDERS: ProviderId[] = [];

function isServer(): boolean {
  return typeof window === 'undefined';
}

function readConnected(): ProviderId[] {
  // Cache useSyncExternalStore snapshots by identity. Lazy reads keep MMKV and localStorage
  // out of SSR.
  if (cachedConnected == null && !isServer()) {
    cachedConnected = usableProviderIds();
  }
  return cachedConnected ?? SERVER_CONNECTED_PROVIDERS;
}

function getServerSnapshot(): ProviderId[] {
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

/** Connected and usable providers, updated when the session or its credentials change. */
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
 * Reactive: the stored Hardcover session can't refresh again
 * (`hardcoverNeedsReconnect`). Drives the trackers-screen reconnect banner and
 * turns off when a new connect overwrites the session.
 */
export function useHardcoverNeedsReconnect(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && hardcoverNeedsReconnect(),
    () => false,
  );
}

/**
 * Reactive: the Hardcover session may read and edit lists
 * (`hardcoverListsGranted`). List surfaces show a reconnect prompt while it
 * is false.
 */
export function useHardcoverListsGranted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && hardcoverListsGranted(),
    () => false,
  );
}

export function useHardcoverListsRefused(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isServer() && hardcoverListsRefused(),
    () => false,
  );
}

/**
 * Read usable providers at fetch time. A connect can invalidate gathers before React renders
 * their new provider set.
 */
export function currentUsableProviders(): readonly ProviderId[] {
  return isServer() ? SERVER_CONNECTED_PROVIDERS : usableProviderIds();
}

export function purgeProviderQueries(queryClient: QueryClient, id: ProviderId): void {
  // Drop the provider's cached reads with its session — every provider's
  // query-key root is its id. Reconnecting (possibly as a different account)
  // must not serve the old account's data; the AniList viewer id is even
  // cached forever (state/queries/anilist.ts).
  queryClient.removeQueries({ queryKey: [id] });
  // Up Next uses a shared persisted key, so removing the provider root alone leaves its rows
  // cached.
  queryClient.removeQueries({ queryKey: [...UP_NEXT_QUERY_ROOT] });
  // Also purge the merged watchlist. Its key does not name individual sessions.
  queryClient.removeQueries({ queryKey: [...WATCHLIST_QUERY_ROOT] });
  // The persisted diary can share a key across accounts on the same provider.
  queryClient.removeQueries({ queryKey: [...DIARY_QUERY_ROOT] });
}

export function disconnectProvider(queryClient: QueryClient, id: ProviderId): void {
  // A pending PKCE verifier/state pair is scoped to a connect attempt, not a
  // session, but disconnecting mid-flow must not leave material around that
  // would validate some future stray code (plan 0034 U5).
  switch (id) {
    case Provider.Hardcover:
      // Hardcover lists each app's sessions to the member, so end this one
      // there too. It needs the token, so it runs before the clear.
      revokeHardcover();
      clearHardcoverAuthFlow();
      break;
    case Provider.Simkl:
      clearSimklAuthFlow();
      break;
    default:
      break;
  }
  clearProviderSession(id);
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
