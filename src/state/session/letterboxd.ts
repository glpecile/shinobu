import { useSyncExternalStore } from 'react';

import type { LetterboxdSession } from '@/lib/providers/letterboxd/deps';
import {
  getProviderSession,
  onSessionChange,
  setProviderSession,
} from './tokens';

/**
 * Connect for reads only: a public username, no login (plan 0012 decision 1) —
 * stored as a regular `ProviderSession` so `useConnectedProviders` and
 * disconnect flows treat it like every other provider. Writes stay disabled
 * until a web session is captured (`connectLetterboxdSession`).
 */
export function connectLetterboxd(username: string): void {
  setProviderSession('letterboxd', { accessToken: '', username });
}

/**
 * Connect with a captured web login (plan 0012 session-capture path): the
 * username derived from the `letterboxd.signed.in.as` cookie, plus the cookie
 * header + CSRF token that authorize diary writes.
 */
export function connectLetterboxdSession(params: {
  username: string;
  cookie: string;
  csrf: string;
  userAgent?: string;
}): void {
  setProviderSession('letterboxd', {
    accessToken: '',
    username: params.username,
    cookie: params.cookie,
    csrf: params.csrf,
    userAgent: params.userAgent,
  });
}

export function getLetterboxdUsername(): string | null {
  return getProviderSession('letterboxd')?.username ?? null;
}

/** The captured write session, or null for a read-only (username-only) connect. */
export function getLetterboxdSession(): LetterboxdSession | null {
  const session = getProviderSession('letterboxd');
  if (
    session?.cookie == null ||
    session.cookie === '' ||
    session.csrf == null ||
    session.csrf === ''
  ) {
    return null;
  }
  return {
    cookie: session.cookie,
    csrf: session.csrf,
    userAgent: session.userAgent,
  };
}

/**
 * Reactive "is a Letterboxd *write* session captured?" — drives the hidden
 * authenticated WebView (`LetterboxdWriteBridge`): mount it only once a login
 * exists, and tear it down on disconnect. Writes run inside that WebView
 * because replayed cookies don't authenticate at the origin (plan 0012).
 */
export function useHasLetterboxdWriteSession(): boolean {
  return useSyncExternalStore(
    onSessionChange,
    () => getLetterboxdSession() != null,
    () => false,
  );
}
