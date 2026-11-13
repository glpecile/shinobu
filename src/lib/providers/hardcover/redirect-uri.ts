import { Platform } from 'react-native';

import { SHINOBU_NATIVE_REDIRECT_URI, SHINOBU_WEB_DOMAIN } from '@/lib/config';

/**
 * Web returns carry `?oauth=hardcover`, so `useOAuthCallback` can tell this
 * return from Trakt's unmarked `?code=` and from Simkl's. Hardcover matches
 * redirects byte for byte, and the registration holds exactly
 * `shinobu://redirect` and `https://shinobu.glpecile.xyz/?oauth=hardcover`.
 */
export const HARDCOVER_OAUTH_MARKER_PARAM = 'oauth';
// oxlint-disable-next-line shinobu/no-provider-literals -- registered redirect URI marker; it must match byte-for-byte.
export const HARDCOVER_OAUTH_MARKER_VALUE = 'hardcover';

function withMarker(origin: string): string {
  return `${origin}/?${HARDCOVER_OAUTH_MARKER_PARAM}=${HARDCOVER_OAUTH_MARKER_VALUE}`;
}

/**
 * Hardcover's redirect URI for this platform. On web it follows the page
 * origin: the production registration has no localhost entry on purpose, so
 * local web dev needs a separate dev app's id in `.env.development.local`.
 */
export function getHardcoverRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location.origin) {
      return withMarker(window.location.origin);
    }
    return withMarker(SHINOBU_WEB_DOMAIN);
  }
  return SHINOBU_NATIVE_REDIRECT_URI;
}
