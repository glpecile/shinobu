import { useState } from 'react';

import type { ProviderId } from '@/lib/providers/types';

import {
  clearProviderClientId,
  clearProviderClientSecret,
  getProviderClientId,
  getProviderClientSecret,
  setProviderClientId,
  setProviderClientSecret,
} from './tokens';

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

function readCredentials(id: ProviderId): ProviderCredentials | null {
  const clientId = getProviderClientId(id);
  const clientSecret = getProviderClientSecret(id);
  // Both or nothing: a lone client id (e.g. saved before the secret field
  // existed) can do public reads but fails every token exchange with
  // invalid_client, so it must fall back into the setup form.
  if (clientId == null || clientSecret == null) return null;
  return { clientId, clientSecret };
}

/**
 * Reactive-ish OAuth app credential storage (client id + secret as one unit).
 * Reads synchronously on first client render (no flash) and falls back to
 * null during SSR. Updates are written back to MMKV so the provider layer can
 * read them on the next query.
 */
export function useProviderCredentials(
  id: ProviderId,
): [
  ProviderCredentials | null,
  (credentials: ProviderCredentials) => void,
  () => void,
] {
  const [credentials, setCredentials] = useState<ProviderCredentials | null>(
    () => (typeof window === 'undefined' ? null : readCredentials(id)),
  );

  const save = (next: ProviderCredentials) => {
    setProviderClientId(id, next.clientId);
    setProviderClientSecret(id, next.clientSecret);
    setCredentials(next);
  };

  const clear = () => {
    clearProviderClientId(id);
    clearProviderClientSecret(id);
    setCredentials(null);
  };

  return [credentials, save, clear];
}
