/**
 * One connected provider's OAuth session — the only "account" Shinobu has
 * (AGENTS.md: there is no Shinobu account; a provider's token *is* the
 * session for that provider).
 */
export interface ProviderSession {
  /** Empty string for tokenless sessions (Letterboxd, plan 0012 decision 1). */
  accessToken: string;
  /**
   * Absent for providers that can't refresh: AniList on web uses the implicit
   * grant because its token endpoint blocks browser origins
   * (docs/solutions/web-cors-anilist.md). A 401 with no refreshToken means
   * "reconnect this provider", not a refresh flow.
   */
  refreshToken?: string;
  /** Epoch milliseconds when accessToken expires; absent = long-lived/unknown. */
  expiresAt?: number;
  /**
   * Letterboxd's read session: a public username, no OAuth (plan 0012). Set
   * only by tokenless providers — presence of this record still means
   * "connected" to `connectedProviderIds()`, with zero special-casing.
   */
  username?: string;
  /**
   * Letterboxd's write session, harvested from the login WebView (plan 0012
   * session-capture path): the `Cookie:` header and the CSRF token echoed as
   * `__csrf`. Present only once a web login is captured; absent = read-only.
   * As sensitive as any accessToken — same todos/003 at-rest encryption caveat.
   */
  cookie?: string;
  csrf?: string;
  /**
   * The exact `User-Agent` the login WebView ran under (plan 0012). Letterboxd
   * binds the signed-in session (and Cloudflare binds `cf_clearance`) to the UA
   * that logged in; replaying the cookies from a different UA lands as
   * "remembered but not signed in" and every write 404s. Captured at login and
   * sent verbatim on writes (docs/solutions/letterboxd-no-api-fallback.md).
   */
  userAgent?: string;
}
