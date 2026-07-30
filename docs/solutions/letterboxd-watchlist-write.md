# Letterboxd: the watchlist endpoint, as observed

Captured 2026-07-29 by `app/dev/letterboxd-watchlist-spike` (plan 0031 U6)
inside the authenticated WebView on the iOS dev client, by driving the site's
own watchlist control on `/film/the-thing/` — add, then remove. Credential
headers redacted at capture time.

## The captures

```
POST  /ajax/letterboxd-metadata/                 → 200
      (form-encoded, no body needed)             {"result":true,"csrf":"…","watched":["film:51155"]}

PATCH /api/v0/me/watchlist/294O                  → 204, empty body
      x-csrf-token: «from the metadata call»
      {"inWatchlist":true}                        (the ADD)

PATCH /api/v0/me/watchlist/294O                  → 204, empty body
      {"inWatchlist":false}                       (the REMOVE)
```

`294O` is the film's LID (Letterboxd short id) — The Thing (1982). The same
session also emitted `PATCH /api/v0/me/rate/294O` with `{"rating":2.5}` /
`{"rating":null}` (an accidental star-drag, immediately reverted), which
confirms the whole signed-in mutation surface lives under `/api/v0/me/…` with
the same CSRF discipline.

## Classification (R37/KTD-6)

**Declarative state set — neither add-only nor a toggle.** The body carries
the target state (`inWatchlist: true|false`), so:

- both verbs are expressible with one endpoint;
- a repeat add is idempotent — KTD-6's named hazard (a toggle where a wrong
  guess *removes* a film while reporting success) **does not exist** on this
  endpoint;
- the 204-empty response is unambiguous: the state after the call is the state
  you sent, not "whatever the opposite of before was".

## What an adapter needs (done in plan 0033 — `letterboxd/watchlist-writes.ts`)

1. **Native-only, via the captured session** — the same WebView-session
   plumbing as the diary write (`LetterboxdWriteBridge`); nothing here changes
   the web ban (the fingerprint wall spikes are unaffected —
   `docs/solutions/letterboxd-web-proxy.md`).
2. **CSRF first**: `POST /ajax/letterboxd-metadata/` → `csrf`, sent as
   `x-csrf-token` on the PATCH. The same response's `watched` array is a free
   already-watched signal.
3. **Film LID resolution**: slug → film page → LID (the diary path already
   loads film pages by slug; the LID is in the page markup).
4. Only after that adapter exists do `letterboxd.watchlistWrite` /
   `watchlistRemove` flip from `'manual'` to `'write'` in `registry.ts` —
   flipping first would route the verb to `runProviderWrites`' loud
   missing-adapter error. `unsupportedWritePlatforms: ['web']` keeps web
   manual regardless.

## Harness note

Letterboxd's actions panel (the `…` button on the film backdrop) is a fixed
overlay sized to the WebView viewport, and it **clips its watched/liked/
watchlist icon row without scrolling** when the WebView gets only half a
phone screen. The spike screen now gives the WebView most of the height —
that one-line layout change is what made the control reachable at all.
