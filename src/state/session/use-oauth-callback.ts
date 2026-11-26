import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  getHardcoverRedirectUri,
  HARDCOVER_OAUTH_MARKER_VALUE,
} from '@/lib/providers/hardcover/redirect-uri';
import {
  getSimklRedirectUri,
  SIMKL_OAUTH_MARKER_PARAM,
  SIMKL_OAUTH_MARKER_VALUE,
} from '@/lib/providers/simkl/redirect-uri';
import { getTraktRedirectUri } from '@/lib/providers/trakt/redirect-uri';
import { Provider } from '@/lib/providers/types';
import { connectAniListFromRedirect } from '@/state/queries/anilist';
import { exchangeHardcoverCode } from '@/state/queries/hardcover';
import { exchangeSimklCode } from '@/state/queries/simkl';
import { exchangeTraktCode } from '@/state/queries/trakt';

import { takeOAuthFlow } from './oauth-flow';
import { getClientIdForProvider, getClientSecretForProvider } from './provider-config';
import { connectedProviderIds } from './tokens';

export type OAuthCallbackStatus = 'idle' | 'exchanging' | 'error';

/** Consume single-use Trakt codes and erase them from the address bar in the same step. */
function consumeTraktReturnParams(): {
  code: string | null;
  state: string | null;
  denied: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error') != null;

  if (code == null && !denied) {
    return { code: null, state: null, denied: false };
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('state');
  window.history.replaceState(null, '', url.toString());

  return { code, state, denied };
}

/**
 * Reads a marked OAuth return: Simkl's `?oauth=simkl` or Hardcover's
 * `?oauth=hardcover`. Every code-flow provider redirects to the site origin
 * with `?code=…`, so these two carry a static marker in their registered
 * redirect URI (`simkl/redirect-uri.ts`, `hardcover/redirect-uri.ts`). No
 * such marker returns `null`, and the caller falls through to Trakt. On
 * consumption the code, `state`, `iss` and the marker are stripped from
 * history in the same step, for the same single-use-code reason as Trakt's
 * consumer above.
 */
function consumeMarkedReturnParams(marker: string): {
  code: string | null;
  state: string | null;
  iss: string | null;
  denied: boolean;
} | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get(SIMKL_OAUTH_MARKER_PARAM) !== marker) {
    return null;
  }

  const code = params.get('code');
  const state = params.get('state');
  const iss = params.get('iss');
  const denied = params.get('error') != null;

  if (code == null && !denied) {
    return { code: null, state: null, iss: null, denied: false };
  }

  const url = new URL(window.location.href);
  for (const name of [
    'code',
    'error',
    'error_description',
    'state',
    'iss',
    SIMKL_OAUTH_MARKER_PARAM,
  ]) {
    url.searchParams.delete(name);
  }
  window.history.replaceState(null, '', url.toString());

  return { code, state, iss, denied };
}

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
 * with a query-param return), then Simkl's and Hardcover's *marked* `?code=`
 * (the `?oauth=` marker branches before the code is consumed), then Trakt for
 * every unmarked `?code=`. AniList and Trakt complete only when this browser
 * started that connect: a pending flow (`oauth-flow.ts`) is consumed once and
 * its `state` must match the echoed one. Expects `window` to exist; the hook
 * guards the platform.
 */
export async function handleOAuthReturn(
  setStatus: (status: OAuthCallbackStatus) => void,
): Promise<void> {
  const anilistReturn = consumeAniListReturnFragment();
  if (anilistReturn != null) {
    const expected = takeOAuthFlow(Provider.AniList);
    if (expected == null) return;
    const state = new URLSearchParams(anilistReturn.slice(anilistReturn.indexOf('#') + 1)).get(
      'state',
    );
    // A missing `state` fails too: a crafted link sent while a flow is
    // pending would otherwise complete it.
    if (state !== expected) {
      setStatus('error');
      return;
    }
    if (!connectAniListFromRedirect(anilistReturn)) {
      setStatus('error');
    }
    return;
  }

  const simklReturn = consumeMarkedReturnParams(SIMKL_OAUTH_MARKER_VALUE);
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
      connectedProviderIds().includes(Provider.Simkl) ||
      getClientIdForProvider(Provider.Simkl) === ''
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

  const hardcoverReturn = consumeMarkedReturnParams(HARDCOVER_OAUTH_MARKER_VALUE);
  if (hardcoverReturn != null) {
    if (hardcoverReturn.denied) {
      setStatus('error');
      return;
    }
    if (hardcoverReturn.code == null) return;

    setStatus('exchanging');
    try {
      // The exchange checks `state` against the pending PKCE flow and `iss`
      // against Hardcover's issuer, and rejects before any POST. A stray or
      // replayed link finds no pending flow. A reconnect overwrites a session
      // Hardcover ended, so a stored session does not stop the exchange.
      await exchangeHardcoverCode({
        code: hardcoverReturn.code,
        state: hardcoverReturn.state ?? '',
        iss: hardcoverReturn.iss,
        redirectUri: getHardcoverRedirectUri(),
      });
      setStatus('idle');
    } catch (error) {
      console.warn('Hardcover OAuth code exchange failed', error);
      setStatus('error');
    }
    return;
  }

  const { code, state, denied } = consumeTraktReturnParams();
  if (denied) {
    takeOAuthFlow(Provider.Trakt);
    setStatus('error');
    return;
  }
  if (code == null) return;

  // Only exchange a code with matching pending state. A successful connect can replace a
  // retained session.
  const expected = takeOAuthFlow(Provider.Trakt);
  if (expected == null) return;
  if (state !== expected) {
    setStatus('error');
    return;
  }
  if (
    getClientIdForProvider(Provider.Trakt) === '' ||
    getClientSecretForProvider(Provider.Trakt) === ''
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

/** Mount on the web home route, where all provider OAuth redirects arrive. */
export function useOAuthCallback(): OAuthCallbackStatus {
  const [status, setStatus] = useState<OAuthCallbackStatus>('idle');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    void handleOAuthReturn(setStatus);
  }, []);

  return status;
}
