import type { SerializdSession } from '@/lib/providers/serializd/deps';
import { getProviderSession, setProviderSession } from './tokens';

/**
 * Connect Serializd (plan 0017 R6): store the captured bearer token + username
 * as a regular `ProviderSession` (`{ accessToken, username }`, KTD1 — no new
 * fields), so `connectedProviderIds()` and the disconnect flow treat it exactly
 * like every other provider. Both connect paths (mobile WebView token, web
 * `/login` exchange) land here identically; the web password is discarded by
 * the caller after the exchange, never persisted.
 */
export function connectSerializd(params: {
  accessToken: string;
  username: string;
}): void {
  setProviderSession('serializd', {
    accessToken: params.accessToken,
    username: params.username,
  });
}

export function getSerializdUsername(): string | null {
  return getProviderSession('serializd')?.username ?? null;
}

/**
 * The write/read session, or null when disconnected. Read lazily (never at
 * module top level) so importing this module during web SSR doesn't touch
 * MMKV/localStorage before React uses the server snapshot (R16).
 */
export function getSerializdSession(): SerializdSession | null {
  const session = getProviderSession('serializd');
  if (
    session?.accessToken == null ||
    session.accessToken === '' ||
    session.username == null ||
    session.username === ''
  ) {
    return null;
  }
  return { accessToken: session.accessToken, username: session.username };
}
