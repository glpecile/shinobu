# Web deploys via Cloudflare Workers static assets, not EAS Hosting

**Set up 2026-07-20.** Shinobu's web build (`bun run deploy:web`) now
deploys to Cloudflare Workers (static assets, `wrangler.jsonc`) instead of
EAS Hosting, serving `https://shinobu.glpecile.xyz`.

## Why

EAS Hosting was already working (`eas deploy`, see
`docs/solutions/web-fouc-on-boot.md` for the debugging history there), but
attaching a custom domain to it requires the **Starter plan ($19/mo)** —
custom domains aren't available on EAS's free tier. Before paying for that,
worth checking whether EAS Hosting's actual capability (a server runtime —
Cloudflare Workers under the hood, running Expo Router API routes alongside
the static build) was even needed.

It isn't, right now: the Letterboxd web-proxy spike
(`docs/solutions/letterboxd-web-proxy.md`) was abandoned and its API routes
reverted, so `web.output` is `"static"` with zero server-side routes. The
web build is plain static files — deployable anywhere, no server runtime
required.

Since DNS for `glpecile.xyz` already lives in this same Cloudflare account,
deploying the static export as a Worker (static assets, no `main` script)
in that account gets a **fully automatic custom domain**: a `routes` entry
with `custom_domain: true` on a domain whose zone is in the same account
auto-creates the DNS record and provisions the TLS certificate on deploy —
no manual TXT/CNAME record juggling, unlike EAS Hosting's cross-account
Cloudflare-for-SaaS flow (which needs 3 manually-copied DNS records; see the
custom-domain walkthrough in this repo's PR/chat history if EAS Hosting is
ever revisited).

If server-side routes come back later (a future TMDB proxy, a real
Letterboxd write path, etc.), this doesn't have to be reworked — add a
`main` entrypoint to `wrangler.jsonc` and the Worker becomes full-stack
(`assets` + `main` together), same as EAS Hosting's own Cloudflare Workers
runtime would have provided.

**Update (plan 0017, 2026-07-21): the `main`-handler path is now realized.**
The Serializd web CORS proxy needed exactly this — `wrangler.jsonc` gained
`"main": "worker/index.ts"` and `assets` gained `"binding": "ASSETS"`, so
`assets` + `main` now coexist as pre-plotted. `web.output` stays `"static"`;
the handler relays only `/api/serializd/*` and falls through to
`env.ASSETS.fetch(request)` for everything else, so static serving, the
auto-provisioned custom domain, and the Workers Builds automation below are
all unchanged. `wrangler deploy` bundles the TS Worker (esbuild resolves the
`@/` tsconfig alias — `worker/serializd-proxy.ts` shares the upstream-base +
app-header constants from `src/lib/providers/serializd/config.ts`), no extra
build step. See `docs/solutions/web-cors-serializd.md` for the proxy contract.

## Config

`wrangler.jsonc` (repo root):

```jsonc
{
  "name": "shinobu",
  "compatibility_date": "2026-07-20",
  "assets": {
    "directory": "./dist",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  },
  "routes": [{ "pattern": "shinobu.glpecile.xyz", "custom_domain": true }]
}
```

- `html_handling: "drop-trailing-slash"` matches how Expo Router's static
  export names files (`search.html`, `details/[id].html` — no trailing
  slash) and how Expo Router's own `Link`/router generate hrefs.
- `not_found_handling: "404-page"` needs a literal `404.html` at the
  asset root — Cloudflare's asset router doesn't know about Expo's
  `+not-found.html` convention. `package.json`'s `deploy:web` script copies
  `dist/+not-found.html` → `dist/404.html` after export, before deploying,
  so Expo's real not-found screen (not a generic Cloudflare 404) is what
  users see.
- `main` was originally absent (a pure-assets Worker) — `main` is optional at
  the wrangler config schema level specifically for that case. Since plan 0017
  it points at `worker/index.ts` (the Serializd proxy above), and `assets`
  carries a `"binding": "ASSETS"` so the handler can serve assets for non-proxy
  paths.

## Deploy

```sh
bun run deploy:web
# = bun run build:web && wrangler deploy
# build:web = expo export --platform web && cp dist/+not-found.html dist/404.html
```

Auth is `wrangler login`'s OAuth token (already set up locally); no secrets
needed for this static-only deploy.

## Automatic deploys on push (Cloudflare Workers Builds)

**Set up 2026-07-20.** The `shinobu` Worker is connected to the
`glpecile/shinobu` GitHub repo via **Workers Builds** (dashboard: Worker →
Settings → Build → Connect Git repository). This is *not* GitHub Actions and
*not* in any repo file — the connection, build commands, and env vars all
live in the Cloudflare dashboard. Push to `main` → production deploy to
`shinobu.glpecile.xyz`; pushes to non-production branches → preview versions
(`wrangler versions upload`), not the production domain.

Dashboard build configuration:

- **Build command:** `bunx expo export --platform web && cp 'dist/+not-found.html' dist/404.html`
- **Deploy command:** `npx wrangler deploy`
- **Version command** (non-prod branches): `npx wrangler versions upload`
- **Root directory:** `/`, **Production branch:** `main`

### Gotcha: `expo: not found` — use a runner, not the bare binary

First build failed at the build step with:

```
/bin/sh: 1: expo: not found
Failed: error occurred while running build command
```

The install succeeded (678 packages, `expo` among them) — the problem is
that the dashboard build command runs in a plain `/bin/sh` where
`node_modules/.bin` is **not** on `PATH`. A bare `expo export …` can't be
found even though the package is installed. (This is also why the deploy
command uses `npx wrangler`, not bare `wrangler`.)

Fix: invoke `expo` through a runner — `bunx expo export …` (`bunx` because
Workers Builds detected `bun.lock` and installed with bun; `npx expo …`
works too). Editing the dashboard build command and hitting **Retry build**
re-runs against the same commit — no repo push needed for a build-command
change.

Durable fix now in the repo (2026-07-20): `package.json` has a
`"build:web": "expo export --platform web && cp 'dist/+not-found.html' dist/404.html"`
script (and `deploy:web` chains it: `bun run build:web && wrangler deploy`).
Point the dashboard **Build command** at `bun run build:web` instead of the
inline `bunx expo …` — inside a bun/npm script `node_modules/.bin` *is* on
`PATH`, so bare `expo` resolves, and the build recipe stays version-controlled
in one place rather than duplicated in the dashboard.

### Env vars must be added in the dashboard, not just `.env.local`

The `EXPO_PUBLIC_*` vars the web build inlines at export time
(`EXPO_PUBLIC_TMDB_TOKEN`, `EXPO_PUBLIC_TRAKT_CLIENT_ID`,
`EXPO_PUBLIC_TRAKT_CLIENT_SECRET`, `EXPO_PUBLIC_ANILIST_CLIENT_ID`,
`EXPO_PUBLIC_SIMKL_CLIENT_ID` — v0.2.0 shipped without the Simkl id on both
web and the release APKs because it was missing here *and* from release.yml's
`.env.local` heredoc; every new bundled credential must be added in both
places) live in
`.env.local`, which is **gitignored** — so Cloudflare's build container never
sees them. They must be re-entered under Workers Builds → **Variables and
secrets**. Miss this and the build still *succeeds* (nothing errors on a
missing `EXPO_PUBLIC_*`), but the shipped bundle has them undefined: TMDB
detail/person/studio screens go dark and Trakt/AniList connect break.

Because `EXPO_PUBLIC_*` values are inlined into the client JS at export, the
`Variable` vs `Secret` type choice in the dashboard only controls encryption
at rest in Cloudflare — it does *not* hide them at runtime; they're public in
the shipped bundle either way. (The Trakt client-secret-in-bundle exposure is
a pre-existing property of the BYO-client design, not introduced by this
deploy path.)

## Verification

Curled the live custom domain post-deploy: 200 on `/`, correct
`content-type: text/html`, a real 404 status (not 200) on an unmatched
path, and the `#boot-loader` markup present in the served HTML (see
`web-fouc-on-boot.md` — confirms the fix travelled with the new host).
Re-ran the same Playwright boot-timing check used to verify the FOUC fix
against `shinobu.glpecile.xyz` directly: loader removed in ~375–1600ms on a
cold cache, no gray/unstyled flash in either Chromium or WebKit.

## Not done here

EAS Hosting's `.expo.app` preview deployments from earlier in this work are
untouched — they still exist, still free, and can keep serving as a preview
surface if useful (`eas deploy` without `--prod`). Nothing was deleted on
that side; this only adds a second, production-facing host.
