import { Platform } from 'react-native';

// This module imports react-native (Platform), so the effect layer must not
// depend on it — bun:test can't parse RN's entry point. The GraphQL URL
// lives in http.ts and the authorize URL in external-urls.ts for that
// reason; this file is UI/auth-side only.
import { ANILIST_AUTHORIZE_URL } from '@/lib/providers/external-urls';

export { ANILIST_AUTHORIZE_URL };

// Shinobu's registered AniList API clients — otraku-style implicit grant
// (plan 0011 decision 1): the client id is embedded and public, there is no
// secret, and connecting is one tap. AniList pins exactly ONE redirect URL
// per client and its authorize endpoint ignores any redirect_uri param, so
// each redirect target needs its own client (register at
// https://anilist.co/settings/developer):
//   native → redirect URL "shinobu://redirect"
//   web    → redirect URL SHINOBU_WEB_DOMAIN (lib/config.ts)
const ANILIST_NATIVE_CLIENT_ID = '';
const ANILIST_WEB_CLIENT_ID = '';

/**
 * Platform-appropriate embedded client id; '' when this build ships none.
 * When this resolves to '', the connect UI falls back to a Trakt-style in-app
 * form (one field, no secret) and the id lands in MMKV via
 * `state/session/provider-config.ts` (hybrid model, 2026-07-14).
 *
 * The dev override is **per-platform**, and deliberately so: AniList pins ONE
 * redirect URL per client, and a client is registered for exactly one of them
 * — a `http://localhost:8081` web-dev client CANNOT be used on native. On
 * iOS/Android the token comes back via `openAuthSessionAsync`, whose
 * ASWebAuthenticationSession can only intercept the app's **custom scheme**
 * (`shinobu://redirect`); it never sees an `http://localhost` redirect, so the
 * browser would just navigate to localhost and never return the token. So:
 *   - web    → EXPO_PUBLIC_ANILIST_CLIENT_ID (client registered to the origin,
 *              e.g. http://localhost:8081)
 *   - native → EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID (client registered to
 *              `shinobu://redirect`)
 * A single env var used for both breaks native — that was the bug.
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

/**
 * The implicit-grant authorize URL for a resolved client id. AniList
 * redirects back to the client's registered redirect URL with
 * `#access_token=…&token_type=Bearer&expires_in=…` in the fragment — there
 * is no code exchange.
 */
export function anilistAuthorizeUrl(clientId: string): string {
  return `${ANILIST_AUTHORIZE_URL}?client_id=${clientId}&response_type=token`;
}
