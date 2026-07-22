/**
 * The cookie serializd.com sets at sign-in whose value *is* the bearer token
 * (KTD1/R4, inferred from trakt-serializd-sync's cookie auth). The native
 * WebView harvests it — the mobile connect path where the user types into
 * serializd.com directly, never sending a password to Shinobu.
 */
export const SERIALIZD_TOKEN_COOKIE = 'tvproject_credentials';

/** The name/value shape the WebView's `getCookies` returns (extra fields ignored). */
export interface CookiePair {
  name: string;
  value: string;
}

/**
 * The captured Serializd sign-in — a provider-specific payload (just the token;
 * unlike Letterboxd's cookie+CSRF+UA struct), so the shared sign-in WebView
 * stays agnostic to its shape (KTD5).
 */
export interface CapturedSerializdLogin {
  accessToken: string;
}

/**
 * Pull the token out of the WebView cookie jar, or `null` when the user isn't
 * signed in yet (the token cookie is absent) — the "keep the WebView open"
 * signal. The token is then validated via `/validateauthtoken` before storage.
 */
export function extractSerializdLogin(
  cookies: readonly CookiePair[],
): CapturedSerializdLogin | null {
  const match = cookies.find(
    (cookie) => cookie.name === SERIALIZD_TOKEN_COOKIE && cookie.value !== '',
  );
  return match == null ? null : { accessToken: match.value };
}
