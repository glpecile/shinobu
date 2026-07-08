# Trakt OAuth Setup

Trakt uses a standard OAuth 2.0 Authorization Code flow. Because Trakt does **not**
support PKCE, the app disables it (`usePKCE: false` in `ConnectTraktButton`).

## Register the app

1. Go to https://trakt.tv/oauth/applications and click **New Application**.
2. Fill the form:
   - **Name:** Shinobu
   - **Icon:** any square transparent PNG (≥ 256×256)
   - **Description:** "Cross-platform media tracker that logs movies and TV episodes to Trakt."
   - **Redirect uri:** add one URI per line (must match exactly what the app sends):
     ```
     shinobu://redirect
     http://localhost:8081
     https://shinobu.glpecile.xyz
     ```
   - **Javascript (cors) origins:** only needed for web:
     ```
     http://localhost:8081
     https://shinobu.glpecile.xyz
     ```
   - **Permissions:** enable `/scrobble` (required for writing history). Enable
     `/checkin` only if you want checkins. Enable `/sync` and `/users` if listed.
3. Save and copy the **Client ID**.

## Enter the Client ID in the app

1. Open Shinobu and tap **Connect Trakt**.
2. Paste the Client ID into the input field and tap **Save Client ID**.
3. The redirect URI shown under the input must exactly match one of the redirect
   URIs registered in Trakt.

## How the redirect URI is chosen

`src/lib/providers/trakt/redirectUri.ts` returns a platform-specific URI:

- **iOS / Android:** `shinobu://redirect`
- **Web local dev:** `http://localhost:8081` (read from `window.location.origin`)
- **Web production / SSR:** `https://shinobu.glpecile.xyz` (canonical domain in
  `src/lib/config.ts`)

The canonical production domain is stored in `src/lib/config.ts` as
`SHINOBU_WEB_DOMAIN`.

## Common errors

- **"The requested redirect uri is malformed or doesn't match client redirect
  URI"**: the redirect URI sent by the app does not exactly match a registered
  URI. Check for trailing slashes, wrong path, or mismatched scheme.
- **OAuth error mentioning PKCE**: make sure `usePKCE: false` is set for Trakt's
  `useAuthRequest` config.
