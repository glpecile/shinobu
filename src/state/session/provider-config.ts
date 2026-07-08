import { traktClientId } from '@/lib/providers/trakt/config';
import type { ProviderId } from '@/lib/providers/types';

import { getProviderClientId } from './tokens';

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
