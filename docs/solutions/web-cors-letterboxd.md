# Web CORS: Letterboxd (public pages + RSS)

**Date:** 2026-07-15 · **Verdict: superseded 2026-07-22 — reads go through the
Worker proxy on web (plan 0018); writes stay native-only.**

`letterboxd.com` sends **no `Access-Control-Allow-Origin` header** on the
diary RSS feed or public pages (verified with an `Origin:` request header,
2026-07-15), and there is no official API access to fall back to (plan 0012).

**Resolved 2026-07-22 (plan 0018):** reads run through the same-origin
Cloudflare Worker relay (`/api/letterboxd/{user}/watchlist/`,
`/api/letterboxd/{user}/rss/` — GET-only, unauthenticated), the repo's second
bounded exception to the "never proxied" policy after Serializd. The web
transport rewrite lives behind the injected fetch in
`state/queries/letterboxd.ts`; the old `letterboxdReadsAvailable()` platform
gate is gone. Web connect now validates the username against the live RSS
feed, and the watchlist + diary read on web exactly as on native.

What still holds:

- **Writes are native-only.** Every state-changing POST is Cloudflare
  client-fingerprint walled — confirmed from undici, EAS Hosting, AND Workers
  egress (`docs/solutions/letterboxd-web-proxy.md`, three spike rounds). The
  web `webFetch` dep stays undefined and `useLogMedia` surfaces Letterboxd as
  a per-provider `ProviderAuthError` ("connect on mobile") while other
  providers succeed.
- Gate location for writes: the platform branch stays out of the registry —
  `canWrite` stays `true` because the capability exists, just not on this
  platform.
