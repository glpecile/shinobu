// No official API access (plan 0012): every read targets public letterboxd.com
// surfaces — the diary RSS feed and the watchlist HTML page. The per-film AJAX
// endpoints (/film/{slug}/json/, /image-150/) are Cloudflare-challenged for
// non-browser clients; never call them (docs/solutions/letterboxd-no-api-fallback.md).
export const LETTERBOXD_BASE_URL = 'https://letterboxd.com';

/**
 * The signed-in diary write endpoint (plan 0012, session-capture write path).
 * Keyed on the numeric `filmId`; needs the session cookie + `__csrf`
 * (docs/solutions/letterboxd-no-api-fallback.md).
 */
export const LETTERBOXD_SAVE_DIARY_PATH = '/s/save-diary-entry';

/**
 * The page the native sign-in WebView loads (plan 0012, session-capture path):
 * the user logs in here in a real browser context, then Shinobu harvests the
 * resulting session cookies (index.native.tsx). Detection is cookie-based, so a
 * redirect away from this URL after login is expected, not a problem.
 */
export const LETTERBOXD_SIGN_IN_URL = `${LETTERBOXD_BASE_URL}/sign-in/`;

/** The public poster CDN — URLs are constructed, see normalize.ts. */
export const LETTERBOXD_POSTER_CDN_URL = 'https://a.ltrbxd.com';
