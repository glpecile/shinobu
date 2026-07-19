# Trakt OAuth Setup

Trakt uses a standard OAuth 2.0 Authorization Code flow. Because Trakt does **not**
support PKCE, the app disables it (`usePKCE: false` in `ConnectTraktButton`).

## Register the app

1. Go to https://app.trakt.tv/settings/apps/api/new (Settings → API Apps on
   the new app.trakt.tv frontend). The old
   `https://trakt.tv/oauth/applications` URL is dead as of July 2026 — it
   301-redirects to `app.trakt.tv/oauth/applications`, which 404s. The OAuth
   *endpoints* did not move: `https://trakt.tv/oauth/authorize` and
   `https://api.trakt.tv/oauth/token` are still the documented ones
   (docs now live at https://docs.trakt.tv; the authorize URL 307-redirects
   internally to Trakt's new auth frontend, which is transparent to the flow).
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

1. Open Shinobu and tap **Connect Trakt**. The setup state walks through the
   Trakt form field by field: every redirect URI to register (the current
   device's URI is marked), the CORS origins, and which permission boxes to
   tick.
2. Paste the Client ID into the input field and tap **Save Client ID**.
3. The canonical URI/origin lists live in
   `src/lib/providers/trakt/redirectUri.ts` (`TRAKT_REDIRECT_URIS`,
   `TRAKT_CORS_ORIGINS`) — update those constants if a URI ever changes so the
   in-app instructions stay correct.

## How the redirect URI is chosen

`src/lib/providers/trakt/redirectUri.ts` returns a platform-specific URI:

- **iOS / Android:** `shinobu://redirect`
- **Web local dev:** `http://localhost:8081` (read from `window.location.origin`)
- **Web production / SSR:** `https://shinobu.glpecile.xyz` (canonical domain in
  `src/lib/config.ts`)

The canonical production domain is stored in `src/lib/config.ts` as
`SHINOBU_WEB_DOMAIN`.

## Web: the `?code=` lands on the redirect-URI route, not the initiating route

On web the connect flow is a same-window redirect, and Trakt sends the browser
back to the **registered redirect URI** — the site origin, i.e. the home route
`/` — regardless of which screen started the flow. The code-exchange handler
must therefore be mounted on the home screen, not inside `ConnectTraktButton`
(which lives on `/connect` and is never mounted when the browser returns).

This bug shipped once: the handler lived in the button, the browser came back
to `/?code=...`, nothing exchanged the code, and the app silently stayed
disconnected. The handler now lives in
`src/state/session/use-trakt-oauth-callback.ts`, mounted by `src/app/index.tsx`.
If the web redirect URI ever changes (e.g. to a dedicated `/auth/trakt` route),
move the hook's mount point to that route in the same change.

Constraints inside that hook, all learned the hard way:

- **Authorization codes are single-use with a short TTL.** Strip `?code=` (and
  `error`/`state`) via `history.replaceState` the moment they are seen — before
  the async exchange, and even on paths that don't exchange — so a refresh or a
  restored tab never replays a consumed code (Trakt answers 400
  `invalid_grant`, surfaced as `ProviderNetworkError`).
- **Skip the exchange when Trakt is already connected.** A stale code in a
  leftover tab otherwise produces a guaranteed-failure exchange and a scary
  error for a user whose session is perfectly fine.
- The web build is statically pre-rendered (`web.output: "static"`), so the
  hook must not read `window` in a `useState` initializer — first client render
  has to match the server HTML; do the URL check inside `useEffect`.
- Log exchange failures with `console.warn`, not `console.error` — the failure
  is already surfaced in the UI, and LogBox turns `console.error` into a
  full-screen dev overlay for what is often just a replayed code.

## Common errors

- **"The requested redirect uri is malformed or doesn't match client redirect
  URI"**: the redirect URI sent by the app does not exactly match a registered
  URI. Check for trailing slashes, wrong path, or mismatched scheme.
- **OAuth error mentioning PKCE**: make sure `usePKCE: false` is set for Trakt's
  `useAuthRequest` config.
