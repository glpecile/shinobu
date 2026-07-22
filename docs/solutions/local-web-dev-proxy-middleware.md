# Local web dev: /api/* proxies 404 on Metro (and masquerade as "username not found")

**Date:** 2026-07-22 · **Context:** Serializd (plan 0017) + Letterboxd (plan
0018) web transports both call same-origin `/api/<provider>/*` paths that only
exist when the Cloudflare Worker serves the app. Under `bun web` (Metro dev
server) there is no Worker.

## Symptom

On `localhost:8081`, connecting either proxy-backed provider failed:

- **Letterboxd:** "No Letterboxd member with that username — check the
  spelling." Misleading: `checkUsernameExists` maps any 404 to "user doesn't
  exist", and Metro answered `/api/letterboxd/{user}/rss/` with the SPA
  fallback's 404 page. The proxy being absent looked identical to a bad
  username.
- **Serializd:** "sign-in isn't reachable (404)" — detected the same root
  cause but said so.

## Root cause + why the fix lives in metro.config.js

The web app fetches same-origin relative paths (`/api/serializd/*`,
`/api/letterboxd/*`). Production routes them to the Worker via
`run_worker_first` in `wrangler.jsonc`; Metro has no equivalent, and pointing
the browser at the deployed Worker is not an option (the relays deliberately
emit **no** `Access-Control-Allow-Origin`).

Fix: `metro.config.js` sets `server.enhanceMiddleware` to intercept those two
prefixes and forward them to a locally running `wrangler dev`
(`http://localhost:8787`, overridable via `SHINOBU_WORKER_DEV_ORIGIN`).
`enhanceMiddleware` is honored by Expo CLI
(`@expo/cli …/start/server/metro/instantiateMetro.js`) and runs **ahead of**
`HistoryFallbackMiddleware` in the dev-server stack — so `/api/*` is proxied
before the SPA fallback can 404 it. Verified in Expo SDK 57's
`MetroBundlerDevServer.js` ordering (instantiateMetro appends the enhanced
middleware before ServeStatic/Favicon/HistoryFallback are `.use()`d).

When `wrangler dev` is down, the middleware answers a clean JSON **502**
("start it with `bun run dev:worker`") instead of the misleading SPA 404 —
Letterboxd surfaces it as a network error ("Could not reach Letterboxd") and
Serializd shows the JSON `error` text verbatim.

## Workflow (two terminals)

```sh
bun web              # Metro, hot reload (restart it to pick up metro.config.js changes)
bun run dev:worker   # wrangler dev on :8787 — runs worker/index.ts like production
```

`wrangler dev` needs `dist/` to exist (assets binding) — run
`bun run build:web` once if it's missing. Metro config changes require a
dev-server restart (an already-running `bun web` keeps the old config).

## Verified live (2026-07-22)

Through Metro with the middleware: `GET /api/letterboxd/{user}/rss/` → 200
`application/rss+xml`; `.../watchlist/` → 200 HTML; `GET /api/serializd/show/1396`
→ 200 JSON; `POST /api/serializd/login` (junk) → upstream's real 401 JSON
(proves POST body piping); wrangler stopped → JSON 502 with the actionable
message; wrangler restarted → recovers.
