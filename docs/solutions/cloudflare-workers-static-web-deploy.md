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
- No `main` field: this is a pure-assets Worker, no server-side script.
  `main` is optional at the wrangler config schema level specifically for
  this case.

## Deploy

```sh
bun run deploy:web
# = expo export --platform web && cp dist/+not-found.html dist/404.html && wrangler deploy
```

Auth is `wrangler login`'s OAuth token (already set up locally); no secrets
needed for this static-only deploy.

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
