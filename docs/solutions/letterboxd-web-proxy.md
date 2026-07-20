# Letterboxd web proxy spike: server-side reads work, writes are Cloudflare-walled

**Date:** 2026-07-20 · **Context:** plan 0015 phase-0 spike (R1/R2 gate),
todos/011

Spike route: `src/app/api/letterboxd/spike+api.ts` (throwaway), replaying a
full browser-captured `Cookie` header (incl. `cf_clearance`) + matching
`User-Agent` from (a) localhost (residential IP) and (b) an EAS Hosting
preview deployment (datacenter IP). Results were **identical from both IPs**.

## What works

- **Public reads server-side pass Cloudflare.** `GET /{user}/watchlist/` and
  `GET /film/{slug}/` return 200 from both residential and EAS datacenter IPs,
  with or without session cookies (these pages are public). No challenge page.
- **The captured session authenticates via replay for reads.** `GET /settings/`
  with the replayed cookies returns 200 (signed-out requests redirect to
  `/sign-in/`). So `cf_clearance` is not strictly IP-bound for plain page GETs.

## What doesn't work

- **`POST /api/v0/production-log-entries` is challenged with 403
  ("Just a moment…")** even from the *same residential IP* as the browser,
  with the *exact* browser UA, correct `Origin`/`Referer`, valid
  `X-CSRF-TOKEN` (fresh `supermodelCSRF` from the film page), and valid film
  LID. Cloudflare is checking more than IP+UA+cookies on this endpoint —
  consistent with TLS/client fingerprinting (undici/curl ≠ Firefox), which no
  server-side fetch can fake. This is the same wall that killed cookie-replay
  writes on native (see `letterboxd-no-api-fallback.md` finding 1).
- **Server-side sign-in (`POST /user/login.do`) is challenged too (tested
  2026-07-20, deliberately wrong password so no real credentials were
  involved).** The request never reaches the credential check: Cloudflare
  returns 403 "Just a moment…" from both residential and EAS datacenter IPs.
  The CSRF pre-step works fine (`GET /sign-in/` issues
  `com.xk72.webparts.csrf`) — it's the POST that's walled. Every
  state-changing POST is behind the client-fingerprint check; only GETs pass.

## Consequences for plan 0015 (scope revision)

- **Web reads via the proxy: GO.** The proxy needs no auth at all for public
  watchlist/diary/film data — this alone takes web from zero Letterboxd reads
  to full read parity. (Caveat: private profiles' pages would need the
  session cookie; the transport can forward it when present.)
- **Web writes: dead, again.** Keep writes native-only (WebView transport).
  The browser itself can't make the write either: the CSRF header isn't
  CORS-safelisted → preflight → Letterboxd sends no CORS headers → blocked.
- **Proxy sign-in + cookie-paste connect: dropped.** With writes dead, an
  authenticated session on web buys nothing for public data. Web stays
  username-only (now actually functional), connect-on-mobile for writes.

## Incidental findings

- `eas deploy` failed once with `The specified bucket does not exist` and
  succeeded on immediate retry — transient; retry before debugging.
- `production:identifier` meta is HTML-encoded (`&quot;lid&quot;:`) — regex
  for the LID must handle encoded quotes.
- The normal Letterboxd page HTML contains the string `challenge-platform`
  (Cloudflare script tag) — it is NOT a challenge indicator. Reliable
  challenge signals: HTTP 403 + `<title>Just a moment...</title>`.
- Signed-in state is not reliably detectable from page HTML markers
  (`js-nav-account`, `data-viewingable-identifier` absent even when
  authenticated). Use `GET /settings/` (200 vs redirect) as the auth probe.
