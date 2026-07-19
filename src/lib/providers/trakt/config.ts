export const TRAKT_API_BASE_URL = 'https://api.trakt.tv';
export const TRAKT_AUTHORIZE_URL = 'https://trakt.tv/oauth/authorize';

// Registered at https://app.trakt.tv/settings/apps/api. EXPO_PUBLIC_* vars are
// inlined into the bundle — Trakt has no PKCE, so the secret ships with the
// client on every platform; that's normal for Trakt's ecosystem
// (docs/solutions/web-cors-trakt.md).
export function traktClientId(): string {
  return process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID ?? '';
}

export function traktClientSecret(): string {
  return process.env.EXPO_PUBLIC_TRAKT_CLIENT_SECRET ?? '';
}
