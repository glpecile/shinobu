---
status: in-progress
date: 2026-07-15
---

# 0012 — Letterboxd Integration Without the Official API (todos/004)

## Context

Letterboxd's official API is request-only and its policy explicitly excludes
"personal projects" (screenshot reviewed 2026-07-15; see
`docs/solutions/letterboxd-no-api-fallback.md`). An access-request email has
been drafted (2026-07-15) but access is not granted and may never be. Decision
for this pass: **build the fallback as the shipping integration** — public
RSS + public-page reads, CSV-import writes — structured so that if API access
is ever granted, the official REST provider replaces the transport layer
without changing anything above `lib/providers/letterboxd/`.

Product scope confirmed 2026-07-15:

- **Write path is the priority**: logging a movie (including anime films) must
  reach Letterboxd, **with tags**. Rating/review are out of scope this pass.
- **Watchlist read** as a "Your Watchlist" row on the home feed — nice-to-have,
  included.
- No Letterboxd search, no Letterboxd-sourced trending/browse.

Solutions scan: `web-cors-trakt/anilist/anizip.md` establish the native-only-
on-web policy shape; nothing touches Letterboxd yet. New findings recorded in
`letterboxd-no-api-fallback.md` and `web-cors-letterboxd.md`.

## Update 2026-07-15 (same day) — CSV write path rejected

The CSV-import write path (decisions 2, 3's flush, 8) shipped and was
**rejected by the product owner as unacceptable friction**. Also, the native
export used `expo-file-system` + `expo-sharing`, whose native modules weren't
in the dev-client binary → **app crashed on launch** ("cannot be opened").

Actions taken:

- Removed `expo-file-system`, `expo-sharing`, the pending-log queue, the CSV
  serializer, and the export UI. Reverts the native module set to the last
  working build (no rebuild needed to recover; the crash was a JS-level
  missing-module import).
- **Letterboxd is read-only for now**: `registry.ts` `canWrite: false`, no log
  adapter, so `providersForLog` never targets it. Reads (watchlist) are
  unchanged and stay the shipping feature.
- **Fixed cross-provider id enrichment** (the watchlist-item complaint): a
  MOVIE with no trakt/tmdb/imdb id now resolves via Trakt text search
  (`enrich.ts` → `cachedTraktTextSearch`), so "mark as watched" on a Letterboxd
  watchlist film fans out to Trakt (and, if it's an anime film, on to AniList).

**Write path re-decided → WebView session capture** (product owner, 2026-07-15):
automate writes to the user's own logged-in Letterboxd account via an in-app
`react-native-webview`. Chosen over browser hand-off (too manual) and official
OAuth (their policy denies personal projects). Accepted tradeoffs: violates
Letterboxd ToS, native-only (WebView → clean rebuild required; no web writes,
consistent with reads), and fragile against Cloudflare / internal-endpoint
changes.

Architecture constraints (confirmed):
- The write **must execute inside the WebView's browser context** (injected
  `fetch`), not via extracted cookies + nitro-fetch — Letterboxd's internal
  endpoints Cloudflare-challenge non-browser clients
  (`docs/solutions/letterboxd-no-api-fallback.md`), so only the real WebView
  carries valid session + clearance cookies.
- Sign-in WebView establishes the session; a hidden WebView at write time
  injects the diary POST. Reads stay on the public username scrape.

**Blocked on reconnaissance only obtainable from a logged-in account** (the
implementer has no account access): the authenticated diary-log request
(method, URL, CSRF header/cookie, body fields for film id / watched date /
tags / rating / rewatch), plus the post-login redirect signal. Until captured,
`registry.ts` keeps `canWrite: false` and there is no writer — guessing the
private endpoint would ship a silently-failing logger.

Decisions 2/3-flush/8 below are superseded; the rest (session = username for
reads, reads, web CORS gate, upgrade path) still hold. This section wins where
it conflicts with what follows.

## Update 2026-07-16 — write path unblocked + built (WebView-for-login only)

`api-beta` checked and confirmed a dead end (request-only, excludes personal +
LLM projects; no reply to the email). The signed-in write request shape was
reconstructed from public write-ups (petterhj.no, github.com/dado3212) — **no
account access needed** — and recorded in
`docs/solutions/letterboxd-no-api-fallback.md`.

**Two corrections to the 2026-07-15 plan:**

1. **The write does NOT need to run inside the WebView.** petterhj drives
   `/user/login.do` and `/s/save-diary-entry` from plain server-side Python
   (no browser), so those endpoints are **not** Cloudflare-walled — only the
   `/film/{slug}/json/` AJAX endpoints are. So: **WebView for login only**
   (user signs in, we harvest cookies), then writes go over **native
   nitro-fetch** with the `Cookie:` header + `__csrf`. Simpler and testable —
   the writer is pure Effect + injected fetch, no WebView coupling.
2. **The username is free.** The `letterboxd.signed.in.as` cookie's value *is*
   the signed-in username — derive it, no scrape.

**The diary write:** `POST /s/save-diary-entry` with `filmId` (numeric),
`viewingDateStr` (YYYY-MM-DD, user-local), `specifiedDate`, `rewatch`, `liked`,
`__csrf`, and tags. `filmId` is resolved at write time from the item's slug
(`/film/{slug}/`) or its tmdb id (`/tmdb/{id}/` → film page), since a movie
routed to Letterboxd may carry no Letterboxd identity.

**Built this pass (all green, no native dep yet):**
- `lib/providers/letterboxd/writes.ts` — `logToLetterboxd` (film-id resolution
  + diary POST), Effect-based, fixture-tested (8 tests). Tag param name is the
  one on-device unknown, isolated as `TAG_FIELD`.
- `LetterboxdSession { cookie, csrf }` on `LetterboxdDeps`; captured session
  persisted via `connectLetterboxdSession` / `getLetterboxdSession`
  (`ProviderSession.cookie`/`.csrf`); `letterboxdDeps()` injects it.
- Adapter registered in `useLogMedia`'s `LOG_ADAPTERS` (reached only once
  `canWrite` flips; a missing session fails as `ProviderAuthError`).

**Remaining (needs the native dep → clean rebuild):**
- Add `nitro-webview` (Nitro-first per AGENTS.md; verified it supports remote
  URL + `evaluateJavaScript`/`getCookies`/`onNavigationStateChange`). Native
  module — clean rebuild required.
- Sign-in WebView connect flow: load `letterboxd.com/sign-in`, detect the
  logged-in redirect, `getCookies` → `connectLetterboxdSession`. Replaces the
  username form on native; web has no login (no WebView, no CORS) → read-only.
- Flip `registry.ts` `canWrite: true`, restore the `letterboxd` assertions in
  `routing.test.ts`, verify the tags field reappears in the confirm sheet.

Known follow-up: CSRF token can rotate → on a rejection, `GET /` to refresh and
retry once. Deferred until on-device testing shows it's needed.

## Decisions

1. **Session = public username, no OAuth.** Connecting Letterboxd means
   entering a Letterboxd username; everything we read is public data. Stored
   as a `ProviderSession` with the new optional `username` field (and
   `accessToken: ''`), so `connectedProviderIds()` / `useConnectedProviders`
   pick it up with zero special-casing. On native the username is validated by
   fetching `letterboxd.com/{username}/rss/` (200 = exists); on web (no CORS)
   it is saved unvalidated — reads don't work there anyway (decision 6).

2. **Write = local pending queue → Letterboxd CSV import.** There is no
   sanctioned programmatic write. The `letterboxd` `LogAdapter` in
   `useLogMedia` **enqueues** `{ title, year, watchedDate, tags, rewatch }`
   into an MMKV-backed queue (`lib/providers/letterboxd/queue.ts`). An adapter
   `ok` outcome means **queued, not synced** — UI copy must say so. The user
   flushes the queue from the connect screen: export a CSV in Letterboxd's
   import format (Title, Year, WatchedDate, Tags, Rewatch — Tags verified
   supported) and import it at `letterboxd.com/import`. Entries are cleared
   only when the user confirms the import ("Mark as imported"), never on
   export — a failed import must not lose logs.
   - Reverse-engineering the authenticated internal endpoints (session cookie
     + CSRF) was considered and **rejected**: ToS violation, password
     handling, and Cloudflare-challenged endpoints make it brittle and wrong.

3. **Tags ride the fan-out variables.** `LogMediaVariables` gains
   `tags?: string[]`. The log confirm sheet shows a tags field only when
   `letterboxd` is among the selected targets; only the Letterboxd adapter
   consumes tags (Trakt/AniList writes ignore them).

4. **Reads are scraping-lite, provider-contained.**
   - **Diary**: `letterboxd.com/{username}/rss/` — sanctioned, stable-ish XML
     with `letterboxd:watchedDate`, `letterboxd:rewatch`,
     `letterboxd:memberRating`, **`tmdb:movieId`**, film title/year, poster
     URL in the description. Parsed with a small regex-based parser (no
     DOMParser on Hermes), fixture-tested. Last ~50 entries only.
   - **Watchlist**: `letterboxd.com/{username}/watchlist/` HTML. Each film is
     a `LazyPoster` react-component div carrying `data-item-slug`,
     `data-item-name` ("Title (Year)"), the numeric film id (uid
     `film:{id}`), and a `cacheBustingKey`. Poster URLs are **constructed**
     on the CDN pattern
     `a.ltrbxd.com/resized/film-poster/{id digits joined by /}/{id}-{slug}-0-600-0-900-crop.jpg`
     — verified working; slug-mismatch variants 403 and fall back to no art
     (`letterboxd-no-api-fallback.md`). First page (28 films) only this pass.
   - The per-film AJAX endpoints (`/film/{slug}/json/`, `/film/{slug}/image-150/`)
     are Cloudflare-challenged for non-browser clients — **never** build on
     them.

5. **Provider lib mirrors `trakt/`/`anilist/`**:
   `lib/providers/letterboxd/{config,deps,rss,watchlist,normalize,queue,csv,writes,index}.ts`,
   Effect-based, shared `ProviderError` taxonomy, deps injection, fixture
   tests. `LetterboxdDeps = { fetch: HttpFetch; username: string | null }`.
   Normalization: `id: letterboxd-{slug}`, `type: 'MOVIE'`,
   `externalIds: { letterboxd: slug, tmdb? }` (tmdb only from RSS — the
   watchlist page has no external ids).

6. **Web: reads are native-only; the write path works everywhere.**
   `letterboxd.com` sends no CORS headers (`web-cors-letterboxd.md`), so the
   watchlist/diary reads are skipped on web per the AGENTS.md policy (no
   proxy). The queue + CSV export is pure local state and works on web (CSV
   download via Blob; native uses a share sheet). Registry stays
   `canRead: true` — the platform gate lives at the query layer
   (`state/queries/letterboxd.ts`), same place other platform branches live.

7. **Feed & details.** New `yourWatchlist` slot in `useUnifiedFeed` +
   "Your Watchlist" `MediaCarousel` on home. Details resolves watchlist items
   via the feed scan like every other slot; Trakt-backed sections simply don't
   render (no trakt id). Known limit: logging a watchlist-sourced item can
   only reach the Letterboxd queue (no tmdb/trakt ids from the watchlist
   page) — Trakt shows an honest per-provider error. Follow-up candidate:
   resolve ids via Trakt text search or a film-page fetch.

8. **Reconcile:** `providerHasWatch` for Letterboxd checks the **pending
   queue** only (dedupe double-taps). The RSS diary is not consulted this
   pass (50-entry window makes it a weak parity signal); revisit if catch-up
   semantics matter for Letterboxd.

9. **Official-API upgrade path.** If access is granted: `rss.ts`/
   `watchlist.ts`/`queue.ts`+`csv.ts` are replaced by `reads.ts`/`writes.ts`
   over OAuth (`api.letterboxd.com/api/v0`), the username session becomes an
   OAuth session, and the tags field maps to the log-entry `tags` field.
   Nothing above `lib/providers/letterboxd/` + the connect row changes shape.

## New native dependencies

`expo-file-system` + `expo-sharing` for the native CSV share sheet — both are
config-plugin-free Expo modules but ship native code: **clean rebuild
required** (`bun ios.clean` / `bun android.clean`) after install.

## Step plan

1. Docs (this file, two solutions files, todos/004 → in-progress). ✅
2. `lib/providers/letterboxd/` lib + fixture tests (rss, watchlist, poster
   construction, normalize, queue, csv, writes).
3. Session: `username` on `ProviderSession`, letterboxd connect row
   (username form) on the connect screen.
4. `state/queries/letterboxd.ts` + `useUnifiedFeed` slot + home carousel.
5. Queue/export UI on the connect screen + CSV share (native) / download (web).
6. `useLogMedia` adapter + `tags` variable + confirm-sheet tags field +
   "queued for export" outcome copy.
7. `bun test`, `bun lint`, `bun typecheck`; solutions entries for anything
   non-obvious found on the way.

## Update 2026-07-16 — sign-in WebView shipped, write path live

The session-capture write path is complete and green (127 tests, typecheck +
lint clean). Final pieces this pass:

- **`nitro-webview` added** (v0.1.0, Nitro host component — no config plugin,
  autolinked). **Clean rebuild required** (`bun ios.clean` / `bun android.clean`)
  before the native sign-in flow runs — it ships native code and won't load in
  the existing dev-client binary. Web is unaffected (nitro-webview is native-only;
  web resolves the default `index.tsx`).
- **Native connect is now a real sign-in** (`connect-letterboxd-button/index.native.tsx`):
  a `Sign in to Letterboxd` button opens a modal `NitroWebView` at
  `/sign-in/`; on every settled navigation we re-read the cookie jar via the
  hybrid-ref `getCookies` and finish the instant `letterboxd.signed.in.as`
  appears. Web keeps the read-only username form (`index.tsx`) — no WebView,
  no writes (CORS).
- **`captureLoginFromCookies`** (`session-cookies.ts`, 6 unit tests) is the pure,
  testable seam between the WebView jar and `connectLetterboxdSession`: it
  forwards *every* letterboxd.com cookie in the `Cookie` header (the real auth
  cookie is httpOnly — we never name it, only relay it) and surfaces the CSRF
  token separately.
- **`registry.ts` `letterboxd.canWrite: true`** — movies + anime films now fan
  out to Letterboxd, routing tests restored to assert it, and the confirm-sheet
  tags field re-appears automatically (it keys on `providersForLog` including
  letterboxd). A movie logged before Letterboxd is connected on mobile surfaces
  an honest per-provider "reconnect" failure (`ProviderAuthError`), not a drop.

### Still open (on-device, needs the rebuild + a real login)

- **Verify the full round-trip:** sign in → cookie capture → log a movie →
  diary entry appears with tags.
- **CSRF rotation** robustness (deferred): re-harvest the token on a 403 rather
  than failing straight to "reconnect".

### Update 2026-07-16 (later) — 404 root-caused from the live form

First on-device write returned `404 saving diary entry`. Root-caused **without a
rebuild** by extracting the real `<form action="/s/save-diary-entry">` off a live
film page (details + corrected field table in
`docs/solutions/letterboxd-no-api-fallback.md`). Two body bugs fixed in
`writes.ts`: (1) the film is keyed by `viewingableUid=film:{id}`, **not** a
`filmId` field — the 404 cause; (2) tags are one comma-separated `tags` field,
not repeatable `tag` params — which also answers the previously-open TAG_FIELD
question. Also fixed checkbox presence-semantics (`rewatch=false` would have
logged a rewatch). Provider error classes now carry a `message` getter so the
fan-out surfaces the real per-provider reason instead of a bare "Failed on X".
Unit tests updated + green; the write itself still needs the on-device retry to
confirm a 200.

### Web writes: investigated and closed (2026-07-16)

Revisited whether a **popup window** could bring the write path to web so logging
works on all four targets. It cannot — and the blocker is the browser's own
security model, not Letterboxd. Native works only because `nitro-fetch` is *not*
a browser (no same-origin policy, no CORS). On web, a page on Shinobu's origin
acting as `letterboxd.com` hits three independent walls, each fatal on its own:

1. **Cookie origin isolation** — Shinobu's origin cannot read `letterboxd.com`
   cookies at all (not an httpOnly issue; cookies are origin-scoped), so the
   native harvest technique is impossible.
2. **CORS on credentialed writes** — a `credentials:'include'` fetch auto-attaches
   the real session cookie, then the browser blocks it because `letterboxd.com`
   sends no `Access-Control-Allow-Origin: <us>` + `Allow-Credentials: true`.
3. **Cross-origin popups are unscriptable** — `window.open('letterboxd.com')`
   returns a window we can't read (no DOM, no cookies, no cooperative
   `postMessage`). It logs the user in and hands us nothing.

The one browser-legal escape — a hidden cross-origin `<form>` POST (CORS doesn't
block *sending*) — is defeated by the `__csrf` body field, which must match a
cookie we can't read cross-origin. This is *not* the OAuth-popup pattern: that
works only because the provider redirects back to a URL our origin controls, with
a readable token. Letterboxd offers no such redirect.

The only ways around the browser wall are a **stateless proxy** (breaks the
no-backend thesis; the user's session cookie would transit a server we run —
antithetical to the credentials-on-device design) or a **browser extension**
(a separate, desktop-only artifact to build and install). **Decision (user,
2026-07-16): keep writes native-only.** Web stays read-only (public profile /
watchlist feed); the tradeoff of shipping a backend or extension is not worth
breaking the DB-less, credentials-never-leave-the-device thesis. Do not re-open
without new browser capabilities or a deliberate reversal of the no-backend
principle.

**Update 2026-07-20: the stateless-proxy escape was actually tried and is
also dead.** Plan 0015 deliberately reversed the no-proxy stance and spiked an
Expo Router API-route relay. Result: server-side reads pass Cloudflare, but
every state-changing POST (diary write *and* sign-in) is 403-challenged by
Cloudflare client fingerprinting even from the user's own IP with the exact
browser UA and valid cookies — so the proxy could never deliver writes, and
it was abandoned (`docs/solutions/letterboxd-web-proxy.md`). "Keep writes
native-only" is now confirmed from both sides of the wall.
