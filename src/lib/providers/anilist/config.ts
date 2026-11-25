import { Platform } from 'react-native';

// Imports react-native (bun:test cannot parse RN's entry point); keep out of the effect layer.
import { ANILIST_AUTHORIZE_URL } from '@/lib/providers/external-urls';

export { ANILIST_AUTHORIZE_URL };

// AniList pins one redirect URL per client and ignores `redirect_uri`, so
// native (`shinobu://redirect`) and web (`SHINOBU_WEB_DOMAIN`) need separate clients.
const ANILIST_NATIVE_CLIENT_ID = '';
const ANILIST_WEB_CLIENT_ID = '';

/**
 * Returns the platform client id, or '' when unconfigured.
 * Web and native overrides must stay separate: `ASWebAuthenticationSession`
 * only intercepts the custom scheme (`shinobu://redirect`), never `http://localhost`.
 */
export function anilistClientId(): string {
  if (Platform.OS === 'web') {
    const webOverride = process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID;
    return webOverride != null && webOverride !== '' ? webOverride : ANILIST_WEB_CLIENT_ID;
  }
  const nativeOverride = process.env.EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID;
  return nativeOverride != null && nativeOverride !== ''
    ? nativeOverride
    : ANILIST_NATIVE_CLIENT_ID;
}

export function anilistAuthorizeUrl(clientId: string, state?: string): string {
  const url = `${ANILIST_AUTHORIZE_URL}?client_id=${clientId}&response_type=token`;
  return state == null ? url : `${url}&state=${encodeURIComponent(state)}`;
}
