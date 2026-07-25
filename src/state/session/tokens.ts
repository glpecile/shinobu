import { createMMKV } from 'react-native-mmkv';

import type { ProviderId } from '@/lib/providers/types';
import type { ProviderSession } from '@/types/session';

/**
 * Per-provider OAuth token persistence. MMKV is synchronous and universal
 * (localStorage fallback on web). Encryption at rest is deferred to todos/003
 * on purpose — don't add an encryptionKey here without doing that todo.
 */
const storage = createMMKV({ id: 'session' });

const keyFor = (id: ProviderId) => `session.${id}`;
const PROVIDER_KEY_PATTERN = /^session\.(.+)$/;

export function getProviderSession(id: ProviderId): ProviderSession | null {
  const raw = storage.getString(keyFor(id));
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as ProviderSession;
  } catch {
    // Corrupt entry — treat as disconnected rather than crash the session layer.
    storage.remove(keyFor(id));
    return null;
  }
}

export function setProviderSession(id: ProviderId, session: ProviderSession): void {
  storage.set(keyFor(id), JSON.stringify(session));
}

export function clearProviderSession(id: ProviderId): void {
  storage.remove(keyFor(id));
}

export function connectedProviderIds(): ProviderId[] {
  return storage
    .getAllKeys()
    .map((key) => PROVIDER_KEY_PATTERN.exec(key)?.[1])
    .filter((id): id is ProviderId => id != null);
}

const clientIdKeyFor = (id: ProviderId) => `clientId.${id}`;

/** Per-provider API client id — avoids requiring env-file edits for user builds. */
export function getProviderClientId(id: ProviderId): string | null {
  return storage.getString(clientIdKeyFor(id)) ?? null;
}

export function setProviderClientId(id: ProviderId, clientId: string): void {
  storage.set(clientIdKeyFor(id), clientId);
}

export function clearProviderClientId(id: ProviderId): void {
  storage.remove(clientIdKeyFor(id));
}

const clientSecretKeyFor = (id: ProviderId) => `clientSecret.${id}`;

/**
 * Per-provider API client secret, stored alongside the client id — Trakt's
 * token exchange requires the pair, so a user-entered client id without its
 * secret cannot complete OAuth. Same todos/003 encryption caveat as above.
 */
export function getProviderClientSecret(id: ProviderId): string | null {
  return storage.getString(clientSecretKeyFor(id)) ?? null;
}

export function setProviderClientSecret(id: ProviderId, clientSecret: string): void {
  storage.set(clientSecretKeyFor(id), clientSecret);
}

export function clearProviderClientSecret(id: ProviderId): void {
  storage.remove(clientSecretKeyFor(id));
}

/**
 * User-supplied TMDB v4 read token, for builds that ship none (plan 0024 U10).
 * TMDB is deliberately *not* a `ProviderId` — it's a metadata source, never a
 * session or a fan-out target (AGENTS.md) — so it gets its own key here beside
 * `clientId.*` rather than widening the provider union. Stored in the session
 * MMKV file so writes fire `onSessionChange` and every reader re-renders.
 */
const TMDB_TOKEN_KEY = 'tmdbToken';

export function getStoredTmdbToken(): string | null {
  return storage.getString(TMDB_TOKEN_KEY) ?? null;
}

export function setStoredTmdbToken(token: string): void {
  storage.set(TMDB_TOKEN_KEY, token);
}

export function clearStoredTmdbToken(): void {
  storage.remove(TMDB_TOKEN_KEY);
}

/** Subscribe to any session change; returns an unsubscribe function. */
export function onSessionChange(listener: () => void): () => void {
  const subscription = storage.addOnValueChangedListener(() => listener());
  return () => subscription.remove();
}
