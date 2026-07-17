import type { HttpFetch } from '@/lib/http/types';

/**
 * A captured signed-in web session — what writes ride on (plan 0012,
 * session-capture path). Harvested from the login WebView's cookie jar; the
 * username itself comes from the `letterboxd.signed.in.as` cookie
 * (docs/solutions/letterboxd-no-api-fallback.md).
 */
export interface LetterboxdSession {
  /** The full `Cookie:` header value for letterboxd.com (session + CSRF). */
  cookie: string;
  /** Mirrors `com.xk72.webparts.csrf`; echoed as the `__csrf` body param. */
  csrf: string;
}

/**
 * Every Letterboxd effect takes this as its first argument — same
 * deps-injection-without-Layers pattern as TraktDeps/AniListDeps (plan 0006
 * decision 4). Reads only need the public `username`; writes additionally
 * need a captured `session` (absent = read-only connection, the write fails
 * with a dead-session auth error rather than posting anonymously).
 */
export interface LetterboxdDeps {
  fetch: HttpFetch;
  /** The connected public username, or null while disconnected. */
  username: string | null;
  /** Present once a web login was captured; required for writes only. */
  session?: LetterboxdSession | null;
}
