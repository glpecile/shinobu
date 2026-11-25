// Per-film AJAX endpoints (/film/{slug}/json/, /image-150/) are Cloudflare-challenged
// for non-browser clients; never call them (docs/solutions/letterboxd-no-api-fallback.md).
export const LETTERBOXD_BASE_URL = 'https://letterboxd.com';

/**
 * Worker proxy prefix (GET-only, unauthenticated): Letterboxd POSTs are
 * Cloudflare client-fingerprint walled (docs/solutions/letterboxd-web-proxy.md).
 * Kept free of RN/Expo imports so the Worker shares it verbatim.
 */
export const LETTERBOXD_WEB_PROXY_BASE_URL = '/api/letterboxd';

export const LETTERBOXD_SIGN_IN_URL = `${LETTERBOXD_BASE_URL}/sign-in/`;

export const LETTERBOXD_POSTER_CDN_URL = 'https://a.ltrbxd.com';
