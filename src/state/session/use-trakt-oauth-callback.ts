import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getTraktRedirectUri } from '@/lib/providers/trakt/redirectUri';
import { exchangeTraktCode } from '@/state/queries/trakt';

import { getClientIdForProvider } from './provider-config';
import { connectedProviderIds } from './tokens';

export type TraktOAuthCallbackStatus = 'idle' | 'exchanging' | 'error';

/**
 * Reads the OAuth return params and erases them from the URL in the same
 * step. Authorization codes are single-use with a short TTL, so once seen
 * they must never survive in the address bar — a refresh or restored tab
 * would replay them and get a guaranteed 400 from Trakt. `state` is the
 * expo-auth-session echo; it travels with the code and is stripped alongside.
 */
function consumeOAuthReturnParams(): { code: string | null; denied: boolean } {
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
 * Web-only return leg of the Trakt OAuth flow. The web redirect URI is the
 * site origin (`getTraktRedirectUri`), so Trakt sends the user back to the
 * home route with `?code=...` — this hook must be mounted there to finish the
 * exchange. Success persists the session, which flips `useConnectedProviders`
 * and swaps the home screen to the feed; no explicit navigation is needed.
 *
 * State starts as `idle` and only flips inside the effect: the web build is
 * statically pre-rendered, so reading `window` in an initializer would make
 * the first client render disagree with the server HTML and break hydration.
 */
export function useTraktOAuthCallback(): TraktOAuthCallbackStatus {
  const [status, setStatus] = useState<TraktOAuthCallbackStatus>('idle');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const { code, denied } = consumeOAuthReturnParams();
    if (denied) {
      setStatus('error');
      return;
    }
    if (code == null) return;

    // A code can linger in a tab that predates the exchange (or failed it).
    // If Trakt is already connected there is nothing to gain from replaying
    // it, and without a client id the exchange cannot be built at all.
    if (
      connectedProviderIds().includes('trakt') ||
      getClientIdForProvider('trakt') === ''
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
