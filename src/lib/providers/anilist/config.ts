import { Platform } from 'react-native';

// This module imports react-native (Platform), so the effect layer must not
// depend on it — bun:test can't parse RN's entry point. The GraphQL URL
// lives in http.ts for that reason; this file is UI/auth-side only.
export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';

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
 * EXPO_PUBLIC_ANILIST_CLIENT_ID overrides both — which is also how localhost
 * web dev connects (a personal dev client whose registered redirect URL is
 * http://localhost:8081). When this resolves to '', the connect UI falls
 * back to a Trakt-style in-app form (one field, no secret) and the id lands
 * in MMKV via `state/session/provider-config.ts` (hybrid model, 2026-07-14).
 */
export function anilistClientId(): string {
  const override = process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID;
  if (override != null && override !== '') return override;
  return Platform.OS === 'web' ? ANILIST_WEB_CLIENT_ID : ANILIST_NATIVE_CLIENT_ID;
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
