# Web CORS: AniList — GraphQL open, token endpoint blocked → use implicit grant on web

**Verified 2026-07-07** via `curl` with `Origin: http://localhost:8081` (todos/008).

## Findings

- **GraphQL API (`https://graphql.anilist.co`): PASS.** Preflight returns 204 with
  `access-control-allow-origin: *`; `Authorization` and `Content-Type` are in
  `access-control-allow-headers`, so authenticated queries/mutations work from the
  browser. `access-control-expose-headers` includes `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset` — rate-limit handling works on web.
- **Rate limit is currently 30 req/min** (`x-ratelimit-limit: 30` observed on a live
  request — AniList's documented 90/min is degraded at the source; treat 30 as the
  real budget when tuning the provider layer's limiter).
- **OAuth token endpoint (`https://anilist.co/api/v2/oauth/token`): FAIL.**
  `OPTIONS` returns **404 with no CORS headers** (preflight fails), and `POST`
  responses carry no `access-control-allow-origin`. Browser-side
  authorization-code exchange is impossible.

## Consequence: web uses the implicit grant, not a proxy and not "native-only"

AniList officially supports OAuth **implicit grant**
(`https://anilist.co/api/v2/oauth/authorize?client_id=...&response_type=token`):
the access token is delivered in the redirect URL fragment — no token-exchange
POST, so the blocked endpoint is never called from the browser.

- **Web:** implicit grant. Token is long-lived (~1 year). **No refresh token** —
  a 401 means "re-connect AniList," not a refresh flow; the session layer must
  tolerate a missing `refreshToken` for this provider.
- **Native:** authorization-code grant works as documented (token exchange is a
  server-to-server-shaped POST that native apps can make directly; CORS is a
  browser-only constraint).
- AniList stays `canRead`/`canWrite` on web — this is a per-platform *auth flow*
  difference, not a platform-availability gap, so no registry field is needed
  (per todos/008: don't add it until a provider actually fails for API calls).

## Probes

```sh
curl -i -X OPTIONS https://graphql.anilist.co \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, authorization"
# → 204, access-control-allow-origin: *

curl -i -X OPTIONS https://anilist.co/api/v2/oauth/token \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# → 404, no ACAO headers
```
