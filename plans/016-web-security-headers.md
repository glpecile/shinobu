# Plan 016: The web app sends baseline security headers (no framing, nosniff, referrer policy, HSTS)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- public wrangler.jsonc worker/index.ts src/app/+html.tsx`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (none of the chosen headers restricts scripts, styles, images or fetches)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

The web app keeps every provider token in `localStorage`. That includes Simkl
tokens that last about five years, AniList and Serializd bearers, the
user-entered Trakt client secret and the TMDB token. The app also performs
writes from the page: logging, disconnecting, and Letterboxd writes through
the userscript bridge. Today the static site sends no security headers.
`public/` has no `_headers` file, and the Worker only adds headers to its
`/api/*` proxy responses. So:

- Any site can frame the app (clickjacking of connect, disconnect and log actions).
- There is no `X-Content-Type-Options`, `Referrer-Policy` or app-level HSTS.

This plan adds a Cloudflare `_headers` file with directives that **cannot**
break the app: `frame-ancestors`, `base-uri`, `object-src`, nosniff, a
referrer policy and HSTS. A full script, connect and img CSP would also limit
what an injected script can do. But the app calls many provider origins and
has inline scripts in `+html.tsx`, and AGENTS.md treats browser console
warnings as bugs, so a full CSP is left as a separate decision (see
maintenance notes).

## Current state

- `wrangler.jsonc`: the Worker serves static assets from `./dist`.
  `run_worker_first` covers only `/api/serializd/*`, `/api/letterboxd/*` and
  `/api/fourchan/*`. All other paths are served by Cloudflare's asset router
  directly, so Worker code never runs for them.
- `worker/index.ts`: non-proxy requests fall through to `env.ASSETS.fetch(request)` with no added headers.
- `public/`: holds `fonts/`, `letterboxd.user.js` and `splash-icon.png`.
  Expo's web export copies `public/` into the root of `dist/`.
- Cloudflare Workers static assets honour a `_headers` file at the root of
  the assets directory (same syntax as Cloudflare Pages: a path pattern line,
  then indented `Header: value` lines).
- `package.json` scripts: `"build:web": "expo export --platform web --clear --max-workers 2 && cp 'dist/+not-found.html' dist/404.html"`,
  `"dev:worker": "mkdir -p dist && wrangler dev"`.
- Read `docs/solutions/cloudflare-workers-static-web-deploy.md` before
  starting. It records how this deploy is wired.

Nothing in the app is meant to be framed. OAuth flows are same-window
redirects, and the Letterboxd userscript opens tabs, not frames.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`           | exit 0              |
| Build web | `bun run build:web`                       | exit 0, `dist/_headers` exists |
| Serve     | `bun run dev:worker`                      | wrangler prints a local URL (default `http://localhost:8787`) |
| Inspect   | `curl -sI http://localhost:8787/`         | the new headers present |

## Scope

**In scope**: `public/_headers` (create). Add a doc only if step 3 reveals a
non-obvious Cloudflare behaviour, as `docs/solutions/web-security-headers.md`.

**Out of scope**:
- `worker/*.ts`: the proxies already set their own CSP and nosniff.
- A `script-src`/`connect-src`/`img-src` CSP (follow-up).
- `wrangler.jsonc`.

## Git workflow

- Branch: `security/web-headers`
- One commit: `feat(web): send baseline security headers`
- Do NOT push, deploy or open a PR unless the operator instructed it. Deploying is the owner's call.

## Steps

### Step 1: Create `public/_headers`

```
# Baseline headers for every static page and asset (Cloudflare Workers
# static assets reads this file from the dist root). None of these limit
# scripts, styles, images or fetches; a full CSP is a separate decision.
/*
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=15552000
```

No `includeSubDomains` or `preload`: the owner's other subdomains are unknown.

**Verify**: `cat public/_headers` shows the block.

### Step 2: Build and check it lands in `dist`

`bun run build:web` → exit 0, then `test -f dist/_headers && echo ok` → `ok`.

### Step 3: Serve and inspect

Run `bun run dev:worker` in the background. Then:

- `curl -sI http://localhost:8787/` → includes all five headers.
- `curl -sI http://localhost:8787/letterboxd.user.js` → includes them too.
- `curl -sI http://localhost:8787/api/fourchan/a/catalog.json` → still shows
  the proxy's own CSP. It is fine if both appear or only the proxy's; record which.

If `wrangler dev` doesn't apply `_headers` locally, check the Cloudflare docs
for "Workers static assets headers". If it is unsupported in dev but supported
in production, say so in the report and add the docs/solutions note.

**Verify**: the curl outputs above (paste them into your report).

### Step 4: Browser check

Open the local URL in a browser with devtools. Click through Home, Search, a
details page and Settings. The console must show **no new** errors or
warnings. A `frame-ancestors` directive in a header never logs on a top-level page.

**Verify**: describe the result, or say a browser wasn't available.

## Test plan

- No unit tests: headers are config. Verification is curl plus a browser pass.

## Done criteria

- [ ] `public/_headers` exists with the five headers
- [ ] `bun run build:web` exits 0 and `dist/_headers` exists
- [ ] `curl -sI` on `/` shows the headers under `wrangler dev` (or the report explains the dev limitation)
- [ ] `git status` shows only `public/_headers` (plus the optional doc)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The app breaks or logs new console errors in step 4.
- Expo's export doesn't copy files starting with `_` from `public/` into
  `dist/`. Report it. Don't patch `build:web` without the owner.
- Headers are duplicated or conflict on `/api/*` in a way that changes the
  proxy behaviour (e.g. two `Content-Security-Policy` headers where the
  stricter `default-src 'none'` would now apply to a page).

## Maintenance notes

- **Follow-up for the owner (not executed here):** a full CSP
  (`script-src 'self' 'sha256-…'` for the inline scripts in
  `src/app/+html.tsx`, plus `connect-src` and `img-src` allowlists for Trakt,
  Simkl, AniList, TMDB, ani.zip, Letterboxd CDN, Wikidata, Serializd and
  4chan image hosts) would stop an injected script from sending tokens
  elsewhere. Roll it out as `Content-Security-Policy-Report-Only` with a
  browser pass per screen first. Every inline-script edit then needs a hash
  update.
- If an embed use case ever appears (e.g. a widget), `frame-ancestors` is the line to change.
