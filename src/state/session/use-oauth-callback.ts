import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getTraktRedirectUri } from '@/lib/providers/trakt/redirectUri';
import { connectAniListFromRedirect } from '@/state/queries/anilist';
import { exchangeTraktCode } from '@/state/queries/trakt';

import {
  getClientIdForProvider,
  getClientSecretForProvider,
} from './provider-config';
import { connectedProviderIds } from './tokens';

export type OAuthCallbackStatus = 'idle' | 'exchanging' | 'error';

/**
 * Reads Trakt's OAuth return params and erases them from the URL in the same
 * step. Authorization codes are single-use with a short TTL, so once seen
 * they must never survive in the address bar — a refresh or restored tab
 * would replay them and get a guaranteed 400 from Trakt. `state` is the
 * expo-auth-session echo; it travels with the code and is stripped alongside.
 */
function consumeTraktReturnParams(): { code: string | null; denied: boolean } {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const denied = params.get('error') != null;

  if (code == null && !denied) {
    return { code: null, denied: false };
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('state');
  window.history.replaceState(null, '', url.toString());

  return { code, denied };
}

/**
 * Reads AniList's implicit-grant fragment (`#access_token=…`) and erases it.
 * The fragment never reaches any server, but it *is* the bearer token — it
 * must not linger in the address bar/history either. Returns the full URL
 * that carried the fragment, or null when this isn't an AniList return.
 */
function consumeAniListReturnFragment(): string | null {
  const { hash } = window.location;
  if (!hash.includes('access_token=')) return null;

  const carried = window.location.href;
  const url = new URL(carried);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
  return carried;
}

/**
 * Web-only return leg of every provider's OAuth flow, mounted on the home
 * route (both web redirect URIs point at the site origin). Trakt comes back
 * as `?code=…` needing an async exchange; AniList comes back as
 * `#access_token=…` where "exchange" is just parsing the fragment (plan
 * 0011). Success persists the session, which flips `useConnectedProviders`
 * and swaps the home screen to the feed; no explicit navigation is needed.
 *
 * State starts as `idle` and only flips inside the effect: the web build is
 * statically pre-rendered, so reading `window` in an initializer would make
 * the first client render disagree with the server HTML and break hydration.
 */
export function useOAuthCallback(): OAuthCallbackStatus {
  const [status, setStatus] = useState<OAuthCallbackStatus>('idle');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // AniList first: a fragment return needs no network and cannot collide
    // with Trakt's query-param return.
    const anilistReturn = consumeAniListReturnFragment();
    if (anilistReturn != null) {
      if (!connectAniListFromRedirect(anilistReturn)) {
        setStatus('error');
      }
      return;
    }

    const { code, denied } = consumeTraktReturnParams();
    if (denied) {
      setStatus('error');
      return;
    }
    if (code == null) return;

    // A code can linger in a tab that predates the exchange (or failed it).
    // If Trakt is already connected there is nothing to gain from replaying
    // it, and without the client id + secret pair the exchange cannot be
    // built at all.
    if (
      connectedProviderIds().includes('trakt') ||
      getClientIdForProvider('trakt') === '' ||
      getClientSecretForProvider('trakt') === ''
    ) {
      return;
    }

    setStatus('exchanging');
    exchangeTraktCode({ code, redirectUri: getTraktRedirectUri() })
      .then(() => setStatus('idle'))
      .catch((error) => {
        // Expected for replayed or expired codes; the home screen surfaces
        // the failure, so don't escalate to console.error (LogBox overlay).
        console.warn('Trakt OAuth code exchange failed', error);
        setStatus('error');
      });
  }, []);

  return status;
}
