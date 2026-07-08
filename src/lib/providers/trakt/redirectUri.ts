import { Platform } from 'react-native';

import { SHINOBU_WEB_DOMAIN } from '@/lib/config';

const NATIVE_REDIRECT_URI = 'shinobu://redirect';

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
