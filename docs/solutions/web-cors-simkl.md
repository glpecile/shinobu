# Web CORS: Simkl — fully browser-callable, no proxy

**Verified:** 2026-07-31, via `curl` with a foreign `Origin` header against the
live API, CDN, and token endpoints (plan 0034 KTD-9; re-confirmed during U2
implementation for the token exchange).

## Findings

Every surface Shinobu uses answers browsers directly — the first provider where
web needs neither a Worker proxy nor a native-only restriction:

| Endpoint | Probe | Result |
| --- | --- | --- |
| `GET api.simkl.com/search/tv` | foreign `Origin` | 200, `access-control-allow-origin: *`, `access-control-allow-methods: GET,PUT,POST,DELETE,OPTIONS`, `access-control-allow-headers: *` |
| `OPTIONS api.simkl.com/sync/history` | preflight, `Access-Control-Request-Method: POST`, requested headers incl. `authorization` | 200, same wildcard trio |
| `OPTIONS api.simkl.com/oauth/token` | preflight, `Access-Control-Request-Method: POST` | 200, wildcard ACAO incl. POST — browser-origin PKCE token exchange works |
| `GET data.simkl.in/calendar/v2/tv.json` | foreign `Origin` | 200, `access-control-allow-origin: *`; ~1.5 MB payload, `cache-control: max-age=18000` (5 h) |

Pagination headers (`X-Pagination-*`) rode the search response and are
browser-readable under the wildcard `access-control-allow-headers`.

## Consequences

- Simkl reads AND writes run in the browser with the same transport as native
  — no injected web fetch variant, no Worker handler, no
  `unsupportedWritePlatforms` entry.
- The PKCE token exchange (`POST /oauth/token`) is browser-viable, so the web
  connect flow is identical to native modulo redirect URIs (which carry the
  `?oauth=simkl` marker on web — `src/lib/providers/simkl/redirect-uri.ts`).
- The CDN calendar/trending files are cacheable static JSON; fetch once per
  staleTime window, never cache-bust (the docs explicitly warn `?random=`
  query strings break the shared CDN cache).

## Re-probe

```sh
curl -s -D - -o /dev/null -H "Origin: https://shinobu.example.com" \
  "https://api.simkl.com/search/tv?q=breaking&client_id=$SIMKL_CLIENT_ID"
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: https://shinobu.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "https://api.simkl.com/sync/history"
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: https://shinobu.example.com" \
  -H "Access-Control-Request-Method: POST" \
  "https://api.simkl.com/oauth/token"
curl -s -D - -o /dev/null -H "Origin: https://shinobu.example.com" \
  "https://data.simkl.in/calendar/v2/tv.json?client_id=$SIMKL_CLIENT_ID&app-name=shinobu&app-version=1.0.0"
```

If any of these ever stops sending `access-control-allow-origin: *`, Simkl web
support has no automatic fallback — the "never proxied" policy (AGENTS.md)
means a proxy exception would need its own owner decision and contract, like
Serializd's and Letterboxd's.
