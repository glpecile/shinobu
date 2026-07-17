import type { LetterboxdSession } from './deps';

/**
 * The cookie whose value *is* the signed-in username — the presence marker for
 * a successful login (plan 0012 session-capture path).
 */
export const LETTERBOXD_SIGNED_IN_COOKIE = 'letterboxd.signed.in.as';
/** The CSRF token cookie, echoed back on every write as the `__csrf` field. */
export const LETTERBOXD_CSRF_COOKIE = 'com.xk72.webparts.csrf';

/** The name/value shape the WebView's `getCookies` returns (extra fields ignored). */
export interface CookiePair {
  name: string;
  value: string;
}

export interface CapturedLetterboxdLogin {
  /** Derived from `letterboxd.signed.in.as` — also the read-side username. */
  username: string;
  /** Cookie header + CSRF token that authorize diary writes. */
  session: LetterboxdSession;
}

/**
 * Turn the sign-in WebView's cookie jar into a persistable login — or `null`
 * when the user isn't actually signed in yet (the `letterboxd.signed.in.as`
 * marker is absent), which is the "keep the WebView open" signal.
 *
 * The `Cookie` header forwards *every* letterboxd.com cookie the jar holds, not
 * a hand-picked subset: the cookie that actually authenticates the session is
 * httpOnly, so we never see its name from JS — we only need to send it back
 * verbatim. `__csrf` is the one value we must name, so we also surface it
 * separately (docs/solutions/letterboxd-no-api-fallback.md).
 */
export function captureLoginFromCookies(
  cookies: readonly CookiePair[],
  userAgent?: string,
): CapturedLetterboxdLogin | null {
  const present = cookies.filter(
    (cookie) => cookie.name !== '' && cookie.value !== '',
  );

  const byName = new Map(present.map((cookie) => [cookie.name, cookie.value]));
  const username = byName.get(LETTERBOXD_SIGNED_IN_COOKIE);
  const csrf = byName.get(LETTERBOXD_CSRF_COOKIE);
  if (username == null || username === '' || csrf == null || csrf === '') {
    return null;
  }

  const cookie = present
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  // Username may arrive percent-encoded in the cookie; decode defensively but
  // never let a malformed value throw the capture away.
  let decodedUsername = username;
  try {
    decodedUsername = decodeURIComponent(username);
  } catch {
    decodedUsername = username;
  }

  const trimmedUa = userAgent?.trim();
  return {
    username: decodedUsername,
    session: {
      cookie,
      csrf,
      userAgent: trimmedUa != null && trimmedUa !== '' ? trimmedUa : undefined,
    },
  };
}
