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

## Re-spike 2026-07-22 (plan 0018): Workers egress changes nothing for writes; reads ship

The Serializd Worker proxy (plan 0017) made a reads relay nearly free, so the
proxy was revisited as a Cloudflare Worker `main`-handler relay
(worker/letterboxd-proxy.ts) instead of plan 0015's `+api`/EAS design. The
reads half shipped: `GET /api/letterboxd/{user}/watchlist/` and
`/api/letterboxd/{user}/rss/` relay live on `shinobu.glpecile.xyz`, verified
byte-faithful against direct fetches (RSS: 100 real diary items; watchlist
pages structurally identical to direct, incl. empty-watchlist accounts).

The writes question was re-run from **Workers egress** — the one transport the
2026-07-20 spike never tried (Cloudflare's own network, its own TLS
fingerprint) via a throwaway relay (worker/letterboxd-write-spike.ts):

- `POST /api/v0/production-log-entries` with junk cookies/CSRF → **403
  "Just a moment…"** (`challenged: true`). The challenge fires before any
  credential check, same as from EAS/undici and residential IPs. Cloudflare
  challenges its own egress exactly like everyone else's.

That completes the matrix: three server-side transports (undici, EAS Hosting,
Workers), four attempts, all 403-challenged. Writes stay native-WebView-only;
plan 0012's verdict holds a third time. The one cell never tested is *valid*
cookies from Workers egress — the junk-credential test can't rule out a
cookie-validity-sensitive wall, but the fingerprint-check reasoning
(server-side fetch ≠ browser TLS) predicts it changes nothing. If a real
captured session is ever replayed through the spike route and returns
`challenged: false`, promote the POST rule into worker/letterboxd-proxy.ts and
reopen writes; until then the spike route stays as the standing test harness.

## Incidental findings

- `eas deploy` failed once with `The specified bucket does not exist` and
  succeeded on immediate retry — transient; retry before debugging.
- `wrangler deploy` versions propagate unevenly for ~30 s: the first
  post-deploy requests can hit the *previous* version (e.g. proxy paths
  answered with the assets 404 page). Wait and re-curl before debugging a
  "my route isn't running" symptom (2026-07-22).
- Dot-segment traversal (`/api/letterboxd/../secret`) never reaches the
  Worker: WHATWG URL normalization collapses it before routing, so the assets
  404 page answers. The handler's `isUnsafePath` check is defense-in-depth for
  non-URL-normalized callers only, not the primary guard (2026-07-22).
- An *empty* watchlist page renders zero `LazyPoster` components
  (davidehrlich, letterboxd, jack all do) — don't use the component count as a
  proxy-health signal. Use the RSS `<item>` count instead (2026-07-22).
- `production:identifier` meta is HTML-encoded (`&quot;lid&quot;:`) — regex
  for the LID must handle encoded quotes.
- The normal Letterboxd page HTML contains the string `challenge-platform`
  (Cloudflare script tag) — it is NOT a challenge indicator. Reliable
  challenge signals: HTTP 403 + `<title>Just a moment...</title>`.
- Signed-in state is not reliably detectable from page HTML markers
  (`js-nav-account`, `data-viewingable-identifier` absent even when
  authenticated). Use `GET /settings/` (200 vs redirect) as the auth probe.

## Allowlist widening 2026-07-25 (plan 0024 U9): paginated watchlist

The watchlist rule now accepts an optional page suffix:

```
/^[A-Za-z0-9_-]{1,39}\/watchlist\/(page\/[1-9][0-9]{0,3}\/)?$/
```

**Why:** the watchlist row only ever showed page 1 (28 films). The "View all"
grid pages through `/{user}/watchlist/page/N/`, which the old regex (anchored
at `watchlist/$`) rejected as a 404 on web.

**What did *not* change** — every other invariant holds and was re-asserted in
`worker/letterboxd-proxy.test.ts`: GET-only (405 on any other method, including
on a paged path), unauthenticated (no `Authorization`, no cookies either
direction, no client headers relayed), username-locked to the same charset, the
content-type allowlist, the script-killing CSP + `nosniff`, no
`Access-Control-Allow-Origin`, the ~30 s timeout, and traversal rejection.

**Bounds on `N`:** `[1-9][0-9]{0,3}` — 1–9999. `page/0/`, `page/01/`,
`page/99999/`, non-numeric suffixes, a missing trailing slash, and anything
after the suffix are all 404s, and the suffix is watchlist-only (it does not
unlock `/{user}/rss/page/N/` or any other path).

**Still no POST rule.** This widening is a read-path recall fix; the
fingerprint wall on state-changing requests is untouched, and
`worker/letterboxd-write-spike.ts` remains the standing harness that must prove
otherwise before any write rule is considered.
