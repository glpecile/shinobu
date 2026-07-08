import { useState } from 'react';

import type { ProviderId } from '@/lib/providers/types';

import {
  clearProviderClientId,
  getProviderClientId,
  setProviderClientId,
} from './tokens';

/**
 * Reactive-ish client id storage. Reads synchronously on first client render
 * (no flash) and falls back to null during SSR. Updates are written back to
 * MMKV so the provider layer can read them on the next query.
 */
export function useProviderClientId(
  id: ProviderId,
): [string | null, (value: string) => void, () => void] {
  const [clientId, setClientId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getProviderClientId(id),
  );

  const saveClientId = (value: string) => {
    setProviderClientId(id, value);
    setClientId(value);
  };

  const clear = () => {
    clearProviderClientId(id);
    setClientId(null);
  };

  return [clientId, saveClientId, clear];
}
