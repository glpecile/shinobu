# Web CORS: Serializd — browser-walled, reached via a same-origin Worker proxy

**Observed 2026-07-21.** Serializd's unofficial API blocks browser origins, so
Shinobu web cannot call it directly — but unlike Letterboxd it has **no
fingerprint wall**, so a stateless same-origin Cloudflare Worker proxy is enough
(plan 0017 U4, the first deliberate exception to AGENTS.md's "never proxied"
policy). Re-run the probes below rather than re-deriving this if Serializd's
behavior seems to have changed; three active open-source clients
(`Velocidensity/serializd-py`, `skyth3r/unserializd`,
`VanillaChief/trakt-serializd-sync`) are the drift canaries.

## Findings

- **CORS is the only wall.** The API's `Access-Control-Allow-Origin` is a dynamic
  allowlist that echoes back only serializd.com origins. A foreign browser origin
  (including `http://localhost:*`) receives **no** ACAO header, so the browser
  blocks the read — `Origin` is browser-controlled and unspoofable from JS. But
  the server itself **processes** foreign-origin requests fine; the block is
  purely the browser enforcing the missing ACAO.
- **No fingerprint/Cloudflare wall (contrast Letterboxd).** Server-side forwarding
  with the three app headers works from a plain HTTP client with a replayed bearer
  token — no `cf_clearance`, no bound User-Agent, no in-session WebView write
  bridge (see `letterboxd-web-proxy.md` for the failure mode that does *not* apply
  here). This is what makes a stateless proxy viable where Letterboxd's isn't.
- **App headers are mandatory even for public data.** Every non-proxied request
  needs `Origin: https://www.serializd.com`, `Referer: https://www.serializd.com`,
  and `X-Requested-With: serializd_vercel` — without them the API returns generic
  401s even for public reads. Native attaches them via nitro-fetch; the Worker
  proxy attaches them server-side (the browser can't set `Origin`/`Referer`).
- **Base host.** `https://serializd.onrender.com/api` (Render, the hosting domain).
  The vanity `www.serializd.com/api` alias 404'd on POST in the probe. Kept in one
  constant (`lib/providers/serializd/config.ts`, KTD4) so a host migration is a
  one-line change — re-probe `www.serializd.com/api` first if Render is dropped.

## Why a Worker `main` handler (not an Expo API route)

The web build stays `web.output: "static"`. Rather than flip to server output
(which forces a hand-written Worker adapter *plus* a Workers Builds pipeline
rework for one forwarding endpoint), the proxy is a hand-written Worker `main`
entrypoint added to the **existing** static-assets Worker — exactly the
`assets` + `main` shape `cloudflare-workers-static-web-deploy.md` pre-plotted.
`/api/serializd/*` is relayed; everything else falls through to
`env.ASSETS.fetch` unchanged. No `web.output` flip, no EAS cost, custom domain
and Workers Builds automation intact. Trade-off: the Expo dev server does not
serve the Worker, so local web dev of the Serializd path runs under
`wrangler dev`.

## Proxy invariants (the security contract)

`worker/serializd-proxy.ts`, enforced by `worker/serializd-proxy.test.ts` and
written into AGENTS.md § Web & CORS as a reviewable contract:

- Serializd-only **path+method allowlist** — wrong method → 405, anything else
  (incl. `../`/absolute-URL traversal) → 404.
- **No `Access-Control-Allow-Origin`** emitted (blocks foreign browsers using the
  relay as a CORS bypass).
- **No cookies either direction**; forwards **only** `Authorization` upstream.
- **64 KB** body cap (413) and **~30 s** upstream timeout (504).
- **Stateless**, logs no request body or `Authorization` anywhere.
- **Forces `Content-Type: application/json` + `X-Content-Type-Options: nosniff`**
  on every relayed response — never relays an upstream HTML error body (Render
  cold-start 502) verbatim under the app origin.

## Probes

```sh
# Browser-origin read → no ACAO header (browser would block), but the server
# still returns the data (proving the block is browser-side only). App headers
# are required or this 401s regardless of origin.
curl -si 'https://serializd.onrender.com/api/show/1396' \
  -H 'Origin: https://www.serializd.com' \
  -H 'Referer: https://www.serializd.com' \
  -H 'X-Requested-With: serializd_vercel' | grep -i 'access-control-allow-origin'

# A foreign origin gets no ACAO echoed back:
curl -si 'https://serializd.onrender.com/api/show/1396' \
  -H 'Origin: http://localhost:8081' \
  -H 'Referer: https://www.serializd.com' \
  -H 'X-Requested-With: serializd_vercel' | grep -i 'access-control-allow-origin'

# Local proxy smoke (Expo dev server does NOT serve the Worker — use wrangler):
#   wrangler dev
#   curl -s localhost:8787/api/serializd/show/1396   # → Breaking Bad JSON
#   curl -s localhost:8787/                           # → the app still serves
```
