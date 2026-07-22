/**
 * Serializd's unofficial JSON API (plan 0017). Kept free of any RN/Expo import
 * so the Cloudflare Worker proxy (worker/serializd-proxy.ts) can share the
 * upstream-base + app-header constants verbatim (KTD4: one place to re-point).
 *
 * Base-URL note (Appendix): `serializd.onrender.com` is Serializd's hosting
 * domain — the vanity `www.serializd.com/api` alias 404'd on POST in the
 * 2026-07-21 probe. It is an implementation detail; if Serializd migrates off
 * Render, re-probe `www.serializd.com/api` first. This single constant is the
 * only line to change (KTD4).
 */
export const SERIALIZD_UPSTREAM_BASE_URL = 'https://serializd.onrender.com/api';

/** The web front origin the API's CORS allowlist echoes and its app headers name. */
export const SERIALIZD_WEB_ORIGIN = 'https://www.serializd.com';

/** The page the native sign-in WebView loads (cookie capture, R4). */
export const SERIALIZD_SIGN_IN_URL = `${SERIALIZD_WEB_ORIGIN}/login`;

/** Same-origin path the web transport hits; the Worker proxy owns this prefix (KTD3). */
export const SERIALIZD_WEB_PROXY_BASE_URL = '/api/serializd';

/**
 * The three headers every *non-proxied* Serializd request needs (Appendix):
 * requests without them get generic 401s even for public data. The native
 * transport attaches them per request; the Worker proxy attaches them
 * server-side (the browser is forbidden from setting `Origin`/`Referer`).
 */
export const SERIALIZD_APP_HEADERS = {
  Origin: SERIALIZD_WEB_ORIGIN,
  Referer: SERIALIZD_WEB_ORIGIN,
  'X-Requested-With': 'serializd_vercel',
} as const;
