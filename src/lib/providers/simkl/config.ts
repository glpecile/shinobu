/**
 * Simkl API constants (plan 0034). Kept free of any RN/Expo import — the
 * Serializd precedent (`serializd/config.ts`): worker/tooling code could share
 * these constants verbatim if it ever needed to (no proxy exists for Simkl —
 * KTD-9: the API and CDN both send `access-control-allow-origin: *`).
 */
export const SIMKL_API_BASE_URL = 'https://api.simkl.com';

/**
 * The calendar CDN (KTD-4): rolling ~34-day JSON files under
 * `/calendar/v2/{tv,anime,movie_release}.json`, UTC instants, quota-exempt.
 */
export const SIMKL_CDN_BASE_URL = 'https://data.simkl.in';

/** The browser-facing authorize page (the API host only serves the token grant). */
export const SIMKL_AUTHORIZE_URL = 'https://simkl.com/oauth/authorize';

export const SIMKL_APP_NAME = 'shinobu';

/**
 * Mirrors package.json's `version`. A constant rather than a JSON import: the
 * oxlint `@/` alias rule bans `../` paths (package.json lives outside `src/`)
 * and this file must stay RN/bundler-agnostic.
 */
export const SIMKL_APP_VERSION = '1.0.0';

/**
 * App-owned public client id (PKCE — plan 0034 KTD-1, no secret exists).
 * EXPO_PUBLIC_* vars are inlined into the bundle, which is fine for a PKCE
 * client id: it is public by design.
 */
export function simklClientId(): string {
  return process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID ?? '';
}

/**
 * The three URL params Simkl requires on every request (docs: "Every request
 * needs three URL parameters"), CDN calls included. `simklHttp` attaches them
 * automatically; nothing else should build a Simkl URL by hand.
 */
export function simklStandardParams(clientId: string): Record<string, string> {
  return {
    client_id: clientId,
    'app-name': SIMKL_APP_NAME,
    'app-version': SIMKL_APP_VERSION,
  };
}
