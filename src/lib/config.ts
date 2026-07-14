/**
 * Canonical public web origin for the Shinobu app. Used for OAuth redirect
 * matching and any other place the deployed web domain needs to be known.
 */
export const SHINOBU_WEB_DOMAIN = 'https://shinobu.glpecile.xyz';

/**
 * The app-scheme deep link every provider's native OAuth flow returns to
 * (registered as `scheme` in app.json). Shared across providers: Trakt sends
 * `?code=…` here, AniList sends `#access_token=…`.
 */
export const SHINOBU_NATIVE_REDIRECT_URI = 'shinobu://redirect';
