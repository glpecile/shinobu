// No official API access (plan 0012): every read targets public letterboxd.com
// surfaces — the diary RSS feed and the watchlist HTML page. The per-film AJAX
// endpoints (/film/{slug}/json/, /image-150/) are Cloudflare-challenged for
// non-browser clients; never call them (docs/solutions/letterboxd-no-api-fallback.md).
export const LETTERBOXD_BASE_URL = 'https://letterboxd.com';

/**
 * Same-origin path the web read transport hits; the Cloudflare Worker proxy
 * owns this prefix (plan 0018 — the second bounded exception to the AGENTS.md
 * "never proxied" policy, after Serializd). GET-only and unauthenticated:
 * every state-changing POST is Cloudflare client-fingerprint walled, so no
 * proxy can carry writes or sign-in (docs/solutions/letterboxd-web-proxy.md).
 * Kept here (no RN/Expo imports in this file) so the Worker shares it verbatim.
 */
export const LETTERBOXD_WEB_PROXY_BASE_URL = '/api/letterboxd';

/**
 * The page the native sign-in WebView loads (plan 0012, session-capture path):
 * the user logs in here in a real browser context, then Shinobu harvests the
 * resulting session cookies (index.native.tsx). Detection is cookie-based, so a
 * redirect away from this URL after login is expected, not a problem.
 */
export const LETTERBOXD_SIGN_IN_URL = `${LETTERBOXD_BASE_URL}/sign-in/`;

/** The public poster CDN — URLs are constructed, see normalize.ts. */
export const LETTERBOXD_POSTER_CDN_URL = 'https://a.ltrbxd.com';
