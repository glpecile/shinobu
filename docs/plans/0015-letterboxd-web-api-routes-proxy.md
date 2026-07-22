---
status: superseded by plan 0018 (2026-07-22)
date: 2026-07-20
---

# 0015 — Letterboxd Web Parity via Expo Router API Routes (stateless proxy)

**ABANDONED 2026-07-20, after the phase-0 spike ran; READS HALF SUPERSEDED BY
PLAN 0018 (2026-07-22).** Plan 0018 shipped web reads via the Cloudflare
Worker `main`-handler relay (the mechanism plan 0017 proved) instead of this
plan's `+api`/EAS Hosting design — writes and sign-in remain dead, re-confirmed
by a Workers-egress re-spike the same day. The spike
(`docs/solutions/letterboxd-web-proxy.md`) confirmed: server-side GET reads
pass Cloudflare (even from a datacenter IP), but every state-changing POST —
`POST /api/v0/production-log-entries` *and* `POST /user/login.do` — is
403-challenged by Cloudflare client fingerprinting, even from the user's own
residential IP with the exact browser UA and valid cookies/CSRF. Web writes
and proxy sign-in are therefore impossible, and the product owner decided
reads-only web parity wasn't worth the proxy — Letterboxd stays as it was
(native WebView transport, no web reads). Plan 0012's "web writes closed"
verdict stands, now confirmed a second way. The design below is kept for the
record; the only code it produced (a `+api` spike route, `web.output:
"server"`) was reverted/removed in the same session.

Handoff doc written before any implementation. Captures the decisions made in
the 2026-07-20 session, the design, the risks, and the work order. **No code
has been written yet.**

## Context

Letterboxd today (see plan 0012 for the full history):

- **Native (iOS/Android):** full read + write. Connect = WebView sign-in with
  cookie capture (`connect-letterboxd-button/index.native.tsx`); writes execute
  inside a hidden authenticated WebView
  (`components/letterboxd-write-bridge/index.native.tsx` →
  `lib/providers/letterboxd/webview-bridge.ts`) POSTing
  `/api/v0/production-log-entries`; reads scrape the public watchlist over
  nitro-fetch.
- **Web:** username-only, read-only. `letterboxd.com` sends no CORS headers
  (`docs/solutions/web-cors-letterboxd.md`), so the browser cannot read or
  write. `letterboxdReadsAvailable()` returns false on web
  (`state/queries/letterboxd.ts`), and the write `webFetch` dep is undefined so
  writes fail cleanly as `ProviderAuthError`.

**Goal (product owner, 2026-07-20): full web parity — sign-in, watchlist
reads, and diary writes on web — using Expo Router API routes as a stateless
proxy. The native WebView path keeps working untouched; both coexist.**

The mechanism: `letterboxd.com` blocks *browser* origins, not servers. A
`+api.ts` route running on our own web origin can forward requests to
Letterboxd server-side, so the browser only ever talks to
`shinobu.glpecile.xyz` — CORS disappears. The proxy is **stateless**: no
server-side storage, no database, no secrets; the user's Letterboxd session
cookie lives in MMKV on the client (same as native) and is forwarded per
request.

### This reverses two documented decisions — update them in the same PR

1. AGENTS.md "Web & CORS": *"a provider that blocks browser origins is
   native-only on web, never proxied."* → carve out the Letterboxd stateless
   relay (this matches the existing "only permissible server exception is a
   tiny stateless relay" language already in AGENTS.md Notifications).
2. Plan 0012 (2026-07-16): *"Web writes: investigated and closed."* →
   supersede with a pointer here. Also fix the stale bullet in
   `docs/solutions/web-cors-letterboxd.md` (it still references the removed
   CSV path).

## Decisions locked (2026-07-20, product owner)

1. **Scope: everything** — reads + writes + sign-in on web, one pass.
2. **Sign-in: proxy the sign-in form.** User enters Letterboxd
   username/password in Shinobu's connect screen; a `+api` route POSTs to
   Letterboxd's sign-in server-side, captures `Set-Cookie`, and returns the
   session to the client, which persists it via the existing
   `connectLetterboxdSession` (identical session shape to native's cookie
   capture). Credentials pass through the route in memory only — never logged,
   never stored. **Cookie-paste is the documented fallback** if Cloudflare
   challenges the server-side sign-in (see R1/R2).
3. **Hosting: EAS Hosting, free plan.** Resolved 2026-07-20:
   `shinobu.glpecile.xyz` is **not currently hosted anywhere** (fresh deploy,
   no migration). EAS Hosting's Free plan ($0) includes 100k requests/month,
   1M CPU-ms, and 1 GB storage (verified on expo.dev/pricing 2026-07-20) —
   orders of magnitude above a single-user Letterboxd proxy's needs, and it's
   the first-class path for `+api` routes (`eas deploy`, custom domain via
   dashboard/eas.json). If the free tier ever becomes insufficient, the
   `expo-server` Vercel/Netlify adapters are the documented fallback.

**Considered and rejected — browser popup as "web WebView":** opening
`letterboxd.com/sign-in` in a popup (`window.open`) is NOT equivalent to the
native WebView. The native flow works because native code reads the WebView's
cookie jar directly (`getCookies()`), bypassing JS restrictions. A web page
has no such API: the same-origin policy blocks reading a cross-origin
popup's URL/DOM/cookies, and the real session cookie is HttpOnly (invisible
to JS even same-origin). The user could log in in the popup and the app would
learn nothing. This was one of the three walls in plan 0012's "web writes
closed" note; the API-route proxy is the way around it.

## Design

### 1. Server output (prerequisite for everything)

- `app.json`: `web.output: "static"` → `"server"`.
- Set the expo-router plugin `origin` to `SHINOBU_WEB_DOMAIN`
  (`lib/config.ts`) so relative `fetch('/api/...')` resolves in production.
- `expo export -p web` now emits `dist/client` + `dist/server`; local testing
  via `npx expo serve`.
- `metro.config.js` already uses `expo/metro-config` → secret stripping for
  `+api.ts` imports works (no action needed; there are no secrets anyway).
- Constraint: **API route files cannot have platform extensions**
  (`foo+api.web.ts` is invalid). All `+api.ts` code must be
  platform-neutral WinterCG fetch-style.

### 2. API routes (`src/app/api/letterboxd/`)

Keep them few and specific — **not** a generic open proxy:

- `sign-in+api.ts` — `POST { username, password }`. Server-side: replay
  Letterboxd's sign-in form (endpoint + CSRF flow per
  `docs/solutions/letterboxd-no-api-fallback.md`), harvest the `Set-Cookie`
  chain, return `{ username, cookie, csrf, userAgent }`. On Cloudflare
  challenge (403/HTML), return a typed `502` the UI maps to the cookie-paste
  fallback.
- `proxy+api.ts` (or split per concern: `watchlist+api.ts`, `log+api.ts`) —
  forwards a narrow allowlist of Letterboxd paths (`/{user}/watchlist/`,
  `/film/{slug}/`, `/tmdb/{id}/`, `POST /api/v0/production-log-entries`) with
  the client-supplied `Cookie` / `X-CSRF-TOKEN` / `User-Agent` headers
  attached. Hardening:
  - allowlist the `letterboxd.com` origin and the specific path shapes only —
    never forward arbitrary URLs (open-proxy abuse);
  - `Origin` check: only accept requests from our own web origin;
  - small body-size cap; no logging of cookie/credential values.

### 3. Client transport (web)

- The injection points already exist: `LetterboxdDeps.fetch` /
  `LetterboxdDeps.webFetch` (`lib/providers/letterboxd/deps.ts`) and
  `letterboxdDeps()` (`state/queries/letterboxd.ts`). Add a web variant that
  routes Letterboxd-bound requests through `/api/letterboxd/proxy` with the
  MMKV-stored session headers, instead of calling `letterboxd.com` directly.
- `letterboxdReadsAvailable()` flips to true on web **once a write session
  exists** (cookie present) — unauthenticated web reads can also go through
  the proxy (public pages), but decide at spike time whether to keep the
  username-only read-only mode or require sign-in for everything.
- `writes.ts` `logToLetterboxd` stays as-is; the platform difference lives
  entirely behind the injected fetch, matching the existing architecture.
- Connect UI: `connect-letterboxd-button/index.tsx` (web) grows the
  username/password form + cookie-paste fallback; the `.native.tsx` variant is
  untouched.

### 4. Session

No changes to the session model: `ProviderSession` already carries
`username?` / `cookie?` / `csrf?` / `userAgent?` (`types/session.ts`), stored
in MMKV. Web stores the same record the proxy sign-in returns. Stateless
relay = the server never sees storage, only per-request headers.

## Risks (in priority order — R1 gates the whole design)

- **R1 — Cloudflare IP/UA binding may kill proxied *writes*.** The reason
  native writes run inside the WebView is that replayed cookies don't
  authenticate from non-browser clients: the session includes Cloudflare
  `cf_clearance`, which is typically bound to the client IP + UA. A proxy
  changes the client IP to a datacenter IP, so `cf_clearance` may be rejected
  even with the captured UA forwarded. **Mitigation: spike first (phase 0).**
  If writes are blocked but public reads aren't, ship reads+sign-in and keep
  writes native-only; if everything is blocked, the whole approach is dead
  and we fall back to documenting "connect on mobile" again.
- **R2 — Sign-in endpoint bot detection.** Letterboxd's sign-in may present
  Turnstile to datacenter IPs. Fallback: cookie-paste connect UX (user copies
  their `Cookie` header from devtools). Power-user UX but unblocks
  reads+writes without any server-side auth surface.
- **R3 — Deployment is greenfield, not a migration.** The site isn't hosted
  anywhere today, so there's no existing host to displace — but this is the
  project's first `eas deploy`, and pointing `glpecile.xyz` DNS at EAS
  Hosting is part of the work (custom domain via the Expo dashboard or
  `eas.json`).
- **R4 — Fragility.** Same class of risk as the native integration (internal
  endpoints + Cloudflare can change anytime) — already accepted for native in
  plan 0012; record new findings in `docs/solutions/`.
- **R5 — Abuse surface.** A public proxy route can be used to hammer
  Letterboxd with other people's cookies. Allowlisting + origin checks (§2)
  keep it narrow; it's unauthenticated by design (the *user's* cookie is the
  credential), same trust model as the native app holding the cookie.

## Work order

0. **Spike (do first, throwaway):** from a deployed `+api` route (or any
   serverless function on the target host), replay a captured real session
   (`Cookie` + `User-Agent`) against (a) a public watchlist page and (b)
   `POST /api/v0/production-log-entries` with a sacrificial log. Record
   pass/fail per endpoint in `docs/solutions/letterboxd-web-proxy.md`. This
   decides R1/R2 and shapes everything below.
1. Set up EAS Hosting: `eas login` (account needed), first `expo export -p web`
   + `eas deploy` preview with a hello-world route, then custom domain
   `shinobu.glpecile.xyz` (DNS at the `glpecile.xyz` registrar).
2. `app.json` server output + origin; verify `npx expo serve` runs the app
   and a hello-world `+api` route locally.
3. Proxy route(s) with allowlist + origin checks; unit tests (`bun test`) for
   the path/header allowlist logic.
4. Web client transport behind `letterboxdDeps()`; flip the web reads gate;
   watchlist row appears on web.
5. Sign-in route + connect UI (password form; cookie-paste fallback panel).
6. Wire writes through the proxy on web; confirm the log fan-out partial-
   failure surface still reports Letterboxd correctly.
7. Deploy (EAS `eas deploy --prod` or adapter equivalent), repoint
   `shinobu.glpecile.xyz`, smoke-test sign-in → watchlist → log on web.
8. Docs in the same PR: AGENTS.md CORS-policy carve-out, plan 0012 supersede
   note, `docs/solutions/web-cors-letterboxd.md` stale-bullet fix, new
   `docs/solutions/letterboxd-web-proxy.md` from the spike. Also fix the stale
   "Letterboxd is queued — export the CSV" copy in
   `features/log-media/log-media-button.tsx` while in there.

## Rebuild impact

Web-only + JS/TS-only until step 7 — **no native rebuild required**; the
native app never calls the API routes (it keeps the WebView transport). The
`app.json` `web.output` change does not affect native builds. Local dev:
`npx expo serve` to test API routes (Metro dev server also serves them).
