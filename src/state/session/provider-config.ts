import { anilistClientId } from '@/lib/providers/anilist/config';
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
  // Hybrid (2026-07-14): the embedded/env app-owned client (otraku-style
  // implicit grant, plan 0011) when the build ships one, else the id the
  // user entered in the connect form — Trakt-style, minus the secret (the
  // implicit grant has none).
  anilist: () => {
    const embedded = anilistClientId();
    return embedded !== '' ? embedded : (getProviderClientId('anilist') ?? '');
  },
  letterboxd: () => '',
  // No OAuth app registration (plan 0017): Serializd auth is a bearer token
  // captured from the sign-in WebView (native) or exchanged from the
  // email/password `/login` form (web) — no client id.
  serializd: () => '',
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
  serializd: () => '',
};

export function getClientSecretForProvider(id: ProviderId): string {
  return providerClientSecrets[id]();
}
