import type { SerializdSession } from '@/lib/providers/serializd/deps';
import { Provider } from '@/lib/providers/types';
import { getProviderSession, setProviderSession } from './tokens';

export function connectSerializd(params: { accessToken: string; username: string }): void {
  setProviderSession(Provider.Serializd, {
    accessToken: params.accessToken,
    username: params.username,
  });
}

export function getSerializdUsername(): string | null {
  return getProviderSession(Provider.Serializd)?.username ?? null;
}

/**
 * The write/read session, or null when disconnected. Read lazily (never at
 * module top level) so importing this module during web SSR doesn't touch
 * MMKV/localStorage before React uses the server snapshot (R16).
 */
export function getSerializdSession(): SerializdSession | null {
  const session = getProviderSession(Provider.Serializd);
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
