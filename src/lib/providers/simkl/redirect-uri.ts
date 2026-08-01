import { Platform } from 'react-native';

import { SHINOBU_NATIVE_REDIRECT_URI, SHINOBU_WEB_DOMAIN } from '@/lib/config';

const NATIVE_REDIRECT_URI = SHINOBU_NATIVE_REDIRECT_URI;
const WEB_DEV_ORIGIN = 'http://localhost:8081';

/**
 * Web returns carry a static `?oauth=simkl` marker (plan 0034 U5): Trakt and
 * Simkl both redirect to the site origin with `?code=…`, and `useOAuthCallback`
 * must branch before consuming the code — an unmarked `?code=` return stays
 * Trakt's for backward compatibility. Native needs no marker: the app-scheme
 * flow runs through expo-auth-session, where the initiating screen already
 * knows which provider it launched.
 */
export const SIMKL_OAUTH_MARKER_PARAM = 'oauth';
export const SIMKL_OAUTH_MARKER_VALUE = 'simkl';

function withSimklMarker(origin: string): string {
  return `${origin}/?${SIMKL_OAUTH_MARKER_PARAM}=${SIMKL_OAUTH_MARKER_VALUE}`;
}

/**
 * Every redirect URI the Simkl app registration must carry, byte-for-byte —
 * a mismatch was Trakt's classic connect failure
 * (docs/solutions/trakt-oauth-setup.md). The localhost entry only concerns
 * developers, so production builds don't surface it.
 */
export const SIMKL_REDIRECT_URIS: readonly string[] = [
  NATIVE_REDIRECT_URI,
  ...(__DEV__ ? [withSimklMarker(WEB_DEV_ORIGIN)] : []),
  withSimklMarker(SHINOBU_WEB_DOMAIN),
];

/**
 * Simkl OAuth redirect URI, platform-aware — mirrors
 * `trakt/redirect-uri.ts`, plus the web marker above.
 */
export function getSimklRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.origin) {
      return withSimklMarker(window.location.origin);
    }
    return withSimklMarker(SHINOBU_WEB_DOMAIN);
  }

  return NATIVE_REDIRECT_URI;
}
