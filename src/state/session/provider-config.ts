import { traktClientId, traktClientSecret } from '@/lib/providers/trakt/config';
import type { ProviderId } from '@/lib/providers/types';

import { getProviderClientId, getProviderClientSecret } from './tokens';

/**
 * Single object that maps every provider to its API client id resolver.
 * Nothing in the app should call `process.env.EXPO_PUBLIC_*` directly for
 * provider credentials; this registry is the source of truth and also reads
 * any in-app override the user has entered (todos/009, no env-file edits).
 */
export const providerClientIds: Record<ProviderId, () => string> = {
  trakt: () => getProviderClientId('trakt') ?? traktClientId(),
  anilist: () => '',
  letterboxd: () => '',
};

export function getClientIdForProvider(id: ProviderId): string {
  return providerClientIds[id]();
}

/**
 * Client-secret counterpart. An in-app client id must travel with *its own*
 * secret: pairing a user-entered id with the env-baked secret makes every
 * token exchange fail `invalid_client` (public reads still work, which hides
 * the mismatch until connect time).
 */
export const providerClientSecrets: Record<ProviderId, () => string> = {
  trakt: () =>
    getProviderClientId('trakt') != null
      ? (getProviderClientSecret('trakt') ?? '')
      : traktClientSecret(),
  anilist: () => '',
  letterboxd: () => '',
};

export function getClientSecretForProvider(id: ProviderId): string {
  return providerClientSecrets[id]();
}
