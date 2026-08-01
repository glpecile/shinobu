import type { ProviderId } from '@/lib/providers/types';

import { getClientIdForProvider } from './provider-config';
import { connectedProviderIds, getProviderSession } from './tokens';

/**
 * Trakt detachment derived state (plan 0034 U9, R13).
 *
 * After R12 removed the bundled `EXPO_PUBLIC_TRAKT_*` credentials, an
 * existing user can hold a stored Trakt token with no way to use it: every
 * Trakt request carries `trakt-api-key` — exactly the removed credential —
 * so reads cannot survive detachment, and the token itself is bound to the
 * old client id. That state is `MigrationNeeded` in the plan's state diagram:
 * the token is kept as evidence (it drives the migration banner and must
 * never be silently cleared), but the provider is unusable until the user
 * completes the guided BYO setup and a fresh OAuth round-trip.
 */

/**
 * The single trakt-is-usable predicate: connected AND credentialed. Every
 * read gate (feed, up-next, watchlist, diary) and the write fan-out consume
 * it through `useConnectedProviders`/`usableProviderIds` — never sprinkle a
 * per-surface credentials check.
 *
 * Only Trakt needs the credentials leg: AniList/Letterboxd/Serializd requests
 * ride the bearer token alone, and Simkl's PKCE client id is bundled with the
 * build — a stored session for any of them is usable by construction.
 */
export function providerIsUsable(id: ProviderId): boolean {
  if (id === 'trakt') return getClientIdForProvider('trakt') !== '';
  return true;
}

/** `connectedProviderIds()` minus providers in the MigrationNeeded state. */
export function usableProviderIds(): ProviderId[] {
  return connectedProviderIds().filter(providerIsUsable);
}

/**
 * True exactly in the MigrationNeeded state: a Trakt session token exists but
 * no client id resolves (env creds are gone, none stored in-app). Drives the
 * trackers-screen banner ("reconnect to resume syncing").
 */
export function traktNeedsCredentials(): boolean {
  return (
    getProviderSession('trakt') != null && getClientIdForProvider('trakt') === ''
  );
}
