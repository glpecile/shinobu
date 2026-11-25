import { HARDCOVER_LIST_SCOPES } from '@/lib/providers/hardcover/config';
import { Provider, type ProviderId } from '@/lib/providers/types';

import { getClientIdForProvider } from './provider-config';
import { connectedProviderIds, getProviderSession } from './tokens';

/**
 * A stored Trakt session without BYO credentials is connected but unusable. Keep it so the
 * reconnect banner can appear.
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
  switch (id) {
    case Provider.Trakt:
      return getClientIdForProvider(Provider.Trakt) !== '';
    case Provider.Hardcover:
      return !hardcoverNeedsReconnect();
    default:
      return true;
  }
}

/**
 * True when Hardcover's refresh token can't be sent again
 * (`hardcover/auth.ts`). The session stays stored and unusable, and the
 * trackers screen shows the reconnect banner.
 */
export function hardcoverNeedsReconnect(): boolean {
  return getProviderSession(Provider.Hardcover)?.reconnectNeeded === true;
}

/**
 * True when the Hardcover session holds both list scopes. A session from
 * before lists holds none: its library and logging keep working, and list
 * surfaces ask for a reconnect.
 */
export function hardcoverListsGranted(): boolean {
  const scopes = getProviderSession(Provider.Hardcover)?.scopes;
  return scopes != null && HARDCOVER_LIST_SCOPES.every((scope) => scopes.includes(scope));
}

/**
 * True when a connect made since lists shipped still lacks the list scopes.
 * Hardcover caps a grant at what the app registration allows, so another
 * connect changes nothing until the registration allows them
 * (docs/solutions/hardcover-list-scopes.md).
 */
export function hardcoverListsRefused(): boolean {
  return getProviderSession(Provider.Hardcover)?.scopes != null && !hardcoverListsGranted();
}

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
    getProviderSession(Provider.Trakt) != null && getClientIdForProvider(Provider.Trakt) === ''
  );
}
