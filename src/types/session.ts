/**
 * One connected provider's OAuth session — the only "account" Shinobu has
 * (AGENTS.md: there is no Shinobu account; a provider's token *is* the
 * session for that provider).
 */
export interface ProviderSession {
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
}
