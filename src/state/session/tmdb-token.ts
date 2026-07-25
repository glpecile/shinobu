import { useSyncExternalStore } from 'react';

import {
  builderTmdbToken,
  resolveTmdbToken,
} from '@/lib/providers/tmdb/config';

import {
  clearStoredTmdbToken,
  getStoredTmdbToken,
  onSessionChange,
  setStoredTmdbToken,
} from './tokens';

/**
 * The TMDB token, resolved (plan 0024 U10). TMDB is a metadata source, not a
 * provider — it has no `ProviderId`, no session, and is never a fan-out target
 * (AGENTS.md) — so its key lives beside the session's `clientId.*` entries
 * rather than widening the provider union, and the whole resolution lives here
 * in `state` instead of inside `lib/providers` (which must stay RN-free).
 */

let cachedToken: string | null = null;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function readToken(): string {
  // Same snapshot-caching + SSR-lazy contract as `useConnectedProviders`:
  // useSyncExternalStore compares by reference, and MMKV's web fallback is
  // localStorage (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
  if (cachedToken == null && !isServer()) {
    cachedToken = resolveTmdbToken({
      builder: builderTmdbToken(),
      stored: getStoredTmdbToken(),
    });
  }
  return cachedToken ?? '';
}

function getServerSnapshot(): string {
  // The builder token is inlined into the bundle, so it *is* available during
  // server rendering — only the stored one has to wait for hydration.
  return builderTmdbToken();
}

function subscribe(onStoreChange: () => void): () => void {
  return onSessionChange(() => {
    cachedToken = null;
    onStoreChange();
  });
}

/**
 * Non-reactive read, for query functions and dependency wiring (`tmdbDeps`)
 * that run outside React's render. Components that *gate rendering* on the
 * token must use `useTmdbToken` instead — the details screen decides whether
 * person/studio cards navigate at render time, and that decision has to change
 * the moment a token is saved, without an app restart (R13).
 */
export function tmdbToken(): string {
  return readToken();
}

/** Reactive counterpart — re-renders when the stored token is saved or cleared. */
export function useTmdbToken(): string {
  return useSyncExternalStore(subscribe, readToken, getServerSnapshot);
}

/** Whether the build ships its own token — the Connect screen's BYO section
 *  is hidden entirely when it does (a stored value would be ignored anyway). */
export function hasBuilderTmdbToken(): boolean {
  return builderTmdbToken() !== '';
}

/** The stored token itself, for the Connect screen's edit/clear affordances. */
export function storedTmdbToken(): string | null {
  return isServer() ? null : getStoredTmdbToken();
}

/**
 * Persist / drop the user's token. Callers must also drop the caches that were
 * resolved without it — the details query reads the token *outside* its query
 * key under an hour-long staleTime, so an already-visited screen would keep
 * serving provider-only metadata until it expired, which reads exactly like
 * "the token didn't take effect until I restarted the app" (R13).
 * `components/connect-tmdb-token.tsx` does that alongside these calls.
 */
export function saveTmdbToken(token: string): void {
  setStoredTmdbToken(token.trim());
  cachedToken = null;
}

export function clearTmdbToken(): void {
  clearStoredTmdbToken();
  cachedToken = null;
}
