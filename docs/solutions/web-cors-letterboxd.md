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
- **The entire write path** — the log queue is local MMKV and the CSV export
  is a Blob download; no Letterboxd network involved. Web users can log
  movies to the Letterboxd queue and import the CSV themselves.

Gate location: the platform branch lives in `state/queries/letterboxd.ts`
(watchlist query disabled on web), not in the registry — `canRead` stays
`true` because the capability exists, just not on this platform.
