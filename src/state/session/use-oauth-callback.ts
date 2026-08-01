import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  getSimklRedirectUri,
  SIMKL_OAUTH_MARKER_PARAM,
  SIMKL_OAUTH_MARKER_VALUE,
} from '@/lib/providers/simkl/redirect-uri';
import { getTraktRedirectUri } from '@/lib/providers/trakt/redirect-uri';
import { connectAniListFromRedirect } from '@/state/queries/anilist';
import { exchangeSimklCode } from '@/state/queries/simkl';
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
 * Reads Simkl's OAuth return params — and only Simkl's. Trakt and Simkl both
 * redirect to the site origin with `?code=…`, so Simkl's registered redirect
 * URI carries the static `?oauth=simkl` marker (plan 0034 U5,
 * `simkl/redirect-uri.ts`): no marker → `null`, and the caller falls through
 * to Trakt exactly as before. On consumption the code, its `state` echo and
 * the marker itself are stripped from history in the same step, for the same
 * single-use-code reason as Trakt's consumer above.
 */
function consumeSimklReturnParams(): {
  code: string | null;
  state: string | null;
  denied: boolean;
} | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get(SIMKL_OAUTH_MARKER_PARAM) !== SIMKL_OAUTH_MARKER_VALUE) {
    return null;
  }

  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error') != null;

  if (code == null && !denied) {
    // A bare marked visit (e.g. someone opened the registered redirect URI by
    // hand) — Simkl territory, but nothing to consume or exchange.
    return { code: null, state: null, denied: false };
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('state');
  url.searchParams.delete(SIMKL_OAUTH_MARKER_PARAM);
  window.history.replaceState(null, '', url.toString());

  return { code, state, denied };
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
 * The whole return-leg decision, extracted from the hook so the routing is
 * testable without React: AniList's fragment first (no network, can't collide
 * with a query-param return), then Simkl's *marked* `?code=` (the
 * `?oauth=simkl` marker branches before the code is consumed), then Trakt for
 * every unmarked `?code=` — the pre-Simkl behavior, byte for byte. Expects
 * `window` to exist; the hook guards the platform.
 */
export async function handleOAuthReturn(
  setStatus: (status: OAuthCallbackStatus) => void,
): Promise<void> {
  const anilistReturn = consumeAniListReturnFragment();
  if (anilistReturn != null) {
    if (!connectAniListFromRedirect(anilistReturn)) {
      setStatus('error');
    }
    return;
  }

  const simklReturn = consumeSimklReturnParams();
  if (simklReturn != null) {
    if (simklReturn.denied) {
      setStatus('error');
      return;
    }
    if (simklReturn.code == null) return;

    // A code can linger in a tab that predates the exchange (or failed it) —
    // replaying it when Simkl is already connected gains nothing
    // (docs/solutions/trakt-oauth-setup.md lesson), and without a client id
    // the exchange cannot be built at all.
    if (
      connectedProviderIds().includes('simkl') ||
      getClientIdForProvider('simkl') === ''
    ) {
      return;
    }

    setStatus('exchanging');
    try {
      // `state` is validated against the persisted PKCE flow inside the
      // exchange — a mismatch (or no flow in flight) rejects before any POST.
      await exchangeSimklCode({
        code: simklReturn.code,
        state: simklReturn.state ?? '',
        redirectUri: getSimklRedirectUri(),
      });
      setStatus('idle');
    } catch (error) {
      // Expected for replayed/expired codes or a state mismatch; the home
      // screen surfaces the failure, so don't escalate to console.error.
      console.warn('Simkl OAuth code exchange failed', error);
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
  try {
    await exchangeTraktCode({ code, redirectUri: getTraktRedirectUri() });
    setStatus('idle');
  } catch (error) {
    // Expected for replayed or expired codes; the home screen surfaces
    // the failure, so don't escalate to console.error (LogBox overlay).
    console.warn('Trakt OAuth code exchange failed', error);
    setStatus('error');
  }
}

/**
 * Web-only return leg of every provider's OAuth flow, mounted on the home
 * route (all three web redirect URIs point at the site origin). Trakt comes
 * back as `?code=…` needing an async exchange; Simkl as `?oauth=simkl&code=…`
 * (its PKCE exchange, plan 0034 U5); AniList as `#access_token=…` where
 * "exchange" is just parsing the fragment (plan 0011). Success persists the
 * session, which flips `useConnectedProviders` and swaps the home screen to
 * the feed; no explicit navigation is needed.
 *
 * State starts as `idle` and only flips inside the effect: the web build is
 * statically pre-rendered, so reading `window` in an initializer would make
 * the first client render disagree with the server HTML and break hydration.
 */
export function useOAuthCallback(): OAuthCallbackStatus {
  const [status, setStatus] = useState<OAuthCallbackStatus>('idle');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    void handleOAuthReturn(setStatus);
  }, []);

  return status;
}
