# Web CORS: Letterboxd (public pages + RSS)

**Date:** 2026-07-15 · **Verdict: reads are native-only on web.**

`letterboxd.com` sends **no `Access-Control-Allow-Origin` header** on the
diary RSS feed or public pages (verified with an `Origin:` request header,
2026-07-15), and there is no official API access to fall back to (plan 0012).
Per the AGENTS.md Web & CORS policy this makes Letterboxd **reads** a
"connect on mobile" provider on web — no proxy.

What still works on web:

- **Connecting** (entering a username) — pure local state. The username is
  saved unvalidated on web because the validation fetch itself is
  CORS-blocked; native validates against `{username}/rss/`.
- **The write fan-out fails cleanly** — the web `webFetch` dep is undefined,
  so `useLogMedia` surfaces Letterboxd as a per-provider `ProviderAuthError`
  ("connect on mobile") while other providers succeed.

**Re-investigated 2026-07-20 and closed again:** an Expo Router API-route
proxy would bypass CORS for reads (server-side GETs pass Cloudflare), but all
state-changing POSTs (writes, sign-in) are Cloudflare client-fingerprint
walled even with valid cookies/UA — so the proxy was abandoned
(`docs/solutions/letterboxd-web-proxy.md`, plan 0015).

Gate location: the platform branch lives in `state/queries/letterboxd.ts`
(watchlist query disabled on web), not in the registry — `canRead` stays
`true` because the capability exists, just not on this platform.
