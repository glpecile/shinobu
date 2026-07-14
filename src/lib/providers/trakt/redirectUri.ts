import { Platform } from 'react-native';

import { SHINOBU_NATIVE_REDIRECT_URI, SHINOBU_WEB_DOMAIN } from '@/lib/config';

const NATIVE_REDIRECT_URI = SHINOBU_NATIVE_REDIRECT_URI;
const WEB_DEV_ORIGIN = 'http://localhost:8081';

/**
 * Every redirect URI the user's Trakt application must have registered (one
 * per line in the form) so the same app works across devices. Shown in the
 * in-app setup instructions. The localhost entry only concerns developers, so
 * production builds don't ask regular users to register it.
 */
export const TRAKT_REDIRECT_URIS: readonly string[] = [
  NATIVE_REDIRECT_URI,
  ...(__DEV__ ? [WEB_DEV_ORIGIN] : []),
  SHINOBU_WEB_DOMAIN,
];

/**
 * Browser origins for the Trakt form's "Javascript (cors) origins" field —
 * only web builds need these, but registering them up front avoids a second
 * trip to the form. Localhost is dev-only, as above.
 */
export const TRAKT_CORS_ORIGINS: readonly string[] = [
  ...(__DEV__ ? [WEB_DEV_ORIGIN] : []),
  SHINOBU_WEB_DOMAIN,
];

/**
 * Trakt OAuth redirect URI, platform-aware.
 *
 * Native uses the app scheme (`shinobu://redirect`). Web uses the current
 * origin during local development so `http://localhost:8081` matches the
 * Trakt app registration, and falls back to the canonical production domain
 * during SSR or when window is unavailable.
 */
export function getTraktRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return SHINOBU_WEB_DOMAIN;
  }

  return NATIVE_REDIRECT_URI;
}
