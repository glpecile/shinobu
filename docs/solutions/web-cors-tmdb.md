# Web CORS: TMDB — fully browser-callable (API + image CDN)

**Verified 2026-07-19** via `curl` with `Origin: http://localhost:8081` (person
route work). Re-run the probes below rather than re-deriving this if TMDB's
behavior seems to have changed.

## Findings

- **API (`https://api.themoviedb.org/3`): PASS.** Preflight (`OPTIONS`) returns
  200 with `access-control-allow-origin: *`, explicitly allows `Authorization`
  and `Content-Type` (plus the usual browser headers), and all methods
  (`GET,HEAD,PUT,POST,DELETE,OPTIONS`). Real responses also carry
  `access-control-allow-origin: *` **including error responses** (tested: 401
  with a bad Bearer token) — browser JS can read error bodies, not just
  successes. `access-control-max-age: 600` caches the preflight.
- **Image CDN (`https://image.tmdb.org/t/p/...`): PASS for our usage.** Serves
  200 to any origin; posters/headshots render through `expo-image` (an `<img>`
  on web), which needs no CORS at all. Only canvas/fetch reads would — we do
  none.
- **Consequence:** the TMDB-backed person route works on web with no proxy and
  no platform split — `lib/providers/tmdb/` uses the shared `lib/http/client`
  like every other source.

## Probes

```sh
# Preflight
curl -si -X OPTIONS 'https://api.themoviedb.org/3/person/500' \
  -H 'Origin: http://localhost:8081' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'

# Real request (any Bearer token — CORS headers appear even on 401)
curl -si 'https://api.themoviedb.org/3/person/500' \
  -H 'Origin: http://localhost:8081' \
  -H 'Authorization: Bearer <token>'
```
