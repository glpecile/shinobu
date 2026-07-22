---
status: shipped (reads) / writes re-spiked and still walled
date: 2026-07-22
---

# 0018 — Letterboxd web reads via the Cloudflare Worker proxy

Resurrects the reads quarter of abandoned plan 0015 on the Serializd (plan
0017) mechanism. Written after implementation; the live spike results are in
`docs/solutions/letterboxd-web-proxy.md` (2026-07-22 section).

## Context

Plan 0015 wanted *full* web parity (sign-in + reads + writes) via Expo Router
`+api` routes on EAS Hosting. Its phase-0 spike killed writes and sign-in
(Cloudflare client fingerprinting challenges every POST, server-side, from any
IP), and the owner shelved the rest: a reads-only proxy wasn't worth standing
up EAS Hosting + a `web.output: "server"` flip for.

One day later plan 0017 shipped the Serializd proxy: a `main` handler on the
existing static-assets Worker. That changes the calculus completely — a
Letterboxd reads relay is now a marginal-cost addition to infrastructure that
already exists, with a proven, tested contract to copy. The owner ordered it
(2026-07-22), with a re-spike of writes from Workers egress (the one transport
the 0015 spike never tried) before locking the scope.

## Decisions locked (2026-07-22, product owner)

1. **Ship reads via the Worker proxy.** Web goes from zero Letterboxd reads to
   parity with native: watchlist feed row, diary source, and connect-time
   username validation.
2. **Re-spike writes first.** Result: still 403-challenged from Workers egress
   (junk credentials; the challenge precedes any credential check). Writes and
   sign-in stay native-WebView-only — plan 0012's verdict confirmed a third
   time. The throwaway spike relay (worker/letterboxd-write-spike.ts) stays
   deployed as the standing test harness: if a *valid* captured session ever
   returns `challenged: false`, promote the POST rule into the production
   allowlist and reopen writes.
3. **Unauthenticated relay, no cookies either direction.** The read surface is
   public data; a session cookie buys nothing (spike: private profiles are the
   only authenticated read, and the owner is public). Contrast with Serializd's
   `Authorization`-only rule — here there is no credential to forward at all.

## Design (as shipped)

- **Worker relay** — `worker/letterboxd-proxy.ts`, mounted in
  `worker/index.ts` beside the Serializd relay; `wrangler.jsonc`
  `run_worker_first` gains `/api/letterboxd/*`. Allowlist (first-match-wins,
  GET-only): `/{user}/watchlist/` and `/{user}/rss/` with the username
  constrained to `[A-Za-z0-9_-]{1,39}` — the exact two upstream paths the
  client reads (`lib/providers/letterboxd/watchlist.ts`, `diary.ts`).
- **Shared constant** — `LETTERBOXD_WEB_PROXY_BASE_URL = '/api/letterboxd'`
  lives in `lib/providers/letterboxd/config.ts` (no RN imports), imported by
  both the Worker and the web transport (the KTD4 pattern from Serializd).
- **Invariants** (mirror the Serializd contract, adapted for HTML/XML):
  path+method allowlist (405/404 otherwise); traversal rejected; no
  `Access-Control-Allow-Origin` emitted; no client headers forwarded (a single
  fixed server-side `User-Agent` is attached so requests aren't UA-less);
  upstream timeout ~30 s → 504; `Set-Cookie` never relayed (responses are
  built with fresh headers); stateless, nothing logged.
- **Two Letterboxd-specific adaptations:**
  - The relay *serves* HTML/XML (that's the point — the client scrapes it), so
    the Serializd "never relay foreign HTML" rule becomes a content-type
    allowlist (`text/html`, `application/rss+xml`, `application/atom+xml`,
    `text/xml`, `application/xml`) plus a script-killing CSP
    (`default-src 'none'; frame-ancestors 'none'; base-uri 'none';
    form-action 'none'`) and `nosniff` on every relayed body. Direct browser
    navigation to a proxy URL can't execute Letterboxd page scripts under the
    app origin (which holds OAuth tokens in localStorage via MMKV's web
    fallback); `fetch().text()` consumers are unaffected by CSP.
  - The Cloudflare challenge page is itself `text/html`, so content-type alone
    can't filter it — the relay detects it via the spike-proven signals
    (HTTP 403 + `Just a moment` in the body) and maps it to a clean 502 JSON
    error instead of relaying unparseable markup to the scrapers.
- **Web transport** — the platform branch lives in `state/queries/letterboxd.ts`
  behind the injected `LetterboxdDeps.fetch`: web rewrites
  `https://letterboxd.com/...` to `/api/letterboxd/...` and calls plain
  `fetch`; native keeps nitro-fetch direct. Provider lib code untouched.
  `letterboxdReadsAvailable()` is deleted — reads now work everywhere, and the
  SSR-MMkv guard it doubled as is replaced by the `connected.includes(...)`
  gate (empty in the server snapshot — the Serializd R16 pattern) at every
  call site (`useLetterboxdWatchlistQuery`, `use-diary-feed`, `use-unified-feed`,
  `app/(tabs)/index.tsx`). The web connect button drops its
  save-unvalidated branch — web now validates against the live RSS feed like
  native.
- **Write spike harness** — `worker/letterboxd-write-spike.ts`: POST-only
  relay of `/api/v0/production-log-entries` that forwards the caller's
  `Cookie`/`User-Agent`/`X-CSRF-TOKEN` (the caller is the session owner — same
  trust model as the native app holding the cookie) and classifies the
  upstream response as challenged vs reached-Rails. Never logs credential
  values. Throwaway: delete it the day the writes question is settled for
  good (either promotion into the real allowlist or a valid-credential
  confirmation that the wall stands).

## Verification (live, 2026-07-22)

- `GET /api/letterboxd/davidehrlich/rss/` → 200 `application/rss+xml`, 100
  real diary items. `GET .../watchlist/` → 200 HTML byte-faithful to a direct
  fetch (that account's watchlist is genuinely empty; the RSS item count is
  the health signal, not `LazyPoster` count).
- Hardening live: POST to a read path → JSON 405; unlisted path → JSON 404;
  traversal never reaches the Worker (URL normalization); no ACAO header; CSP
  + nosniff present on relayed markup.
- Write spike: `POST /api/letterboxd/spike/production-log-entries` with junk
  credentials → `challenged: true` (403 "Just a moment…").
- `bun test` (333 pass, incl. the relay + spike security boundary), `tsc`,
  `oxlint` all clean.

## Rebuild impact

Web + Worker only — no native rebuild (the native app never calls the proxy;
it keeps nitro-fetch reads and the WebView write transport). Shipped via
`bun run deploy:web`.

## Follow-ups

- If a valid captured session is ever run through the spike route and returns
  `challenged: false`: promote the POST allowlist rule, wire web writes behind
  `LetterboxdDeps.webFetch`-equivalent proxy transport, and revisit web
  sign-in (cookie-paste connect UX). Record in the spike doc either way.
- AGENTS.md's "Web & CORS" section now names **two** bounded proxy exceptions
  (Serializd plan 0017, Letterboxd plan 0018) — keep the "not a general
  license" language intact when a third candidate appears.
