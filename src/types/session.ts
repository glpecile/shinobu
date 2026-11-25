export interface ProviderSession {
  /** Empty string for tokenless sessions (Letterboxd). */
  accessToken: string;
  /** Absent when refresh isn't supported (e.g. AniList implicit grant on web; see `docs/solutions/web-cors-anilist.md`). */
  refreshToken?: string;
  /** Epoch milliseconds when accessToken expires; absent = long-lived/unknown. */
  expiresAt?: number;
  username?: string;
  /** Letterboxd write session from the login WebView (`Cookie` header and `__csrf` token); absent when read-only. */
  cookie?: string;
  csrf?: string;
  /**
   * Exact login WebView `User-Agent`, sent verbatim on writes: Letterboxd and
   * Cloudflare (`cf_clearance`) bind the session to it, so a different UA makes
   * writes 404 (`docs/solutions/letterboxd-no-api-fallback.md`).
   */
  userAgent?: string;
  /**
   * Set when Hardcover refused a refresh or a refresh had an unknown outcome
   * (Hardcover rotates single-use refresh tokens and revokes the chain on replay).
   */
  reconnectNeeded?: boolean;
  /**
   * Hardcover's granted OAuth scopes. Absent on a session from before lists,
   * which therefore has no list scopes
   * (docs/solutions/hardcover-list-scopes.md).
   */
  scopes?: string[];
}
