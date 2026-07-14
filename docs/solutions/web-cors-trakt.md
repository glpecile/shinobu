# Web CORS: Trakt — fully browser-callable (API + OAuth)

**Verified 2026-07-07** via `curl` with `Origin: http://localhost:8081` (todos/008).
Re-run the probes below rather than re-deriving this if Trakt's behavior seems to
have changed.

## Findings

- **API (`https://api.trakt.tv`): PASS.** Preflight (`OPTIONS`) returns 204 with
  `access-control-allow-origin: *`, and explicitly allows the exact headers every
  Trakt call needs: `content-type, trakt-api-key, trakt-api-version, authorization`.
  All methods allowed (`GET,HEAD,PUT,POST,DELETE,PATCH`). Real responses (tested on
  `GET /movies/trending`) also carry `access-control-allow-origin: *`, including
  error responses (403 without a valid key) — so browser JS can read error bodies,
  not just successes.
- **OAuth token endpoint (`https://api.trakt.tv/oauth/token`): PASS.** Preflight 204,
  `access-control-allow-origin: *`, `content-type` allowed — the code→token exchange
  and refresh-token grant are callable directly from the browser. Web OAuth needs no
  special-casing: same authorization-code flow as native, with a web redirect URI
  registered in the Trakt app settings.
- **Rate-limit/pagination headers are browser-readable.** `access-control-expose-headers`
  includes `X-Pagination-Page`, `X-Pagination-Page-Count`, `X-Pagination-Limit`,
  `X-Pagination-Item-Count`, `X-Ratelimit`, and `Retry-After`. The provider layer's
  rate-limit handling (`ProviderRateLimitError.retryAfterMs`) can rely on
  `Retry-After` on web too — no native-only branch needed.

## Consequences

- Trakt is **web-enabled**: both the read path and OAuth run in the browser. No
  platform-availability field needed in `src/lib/providers/registry.ts` for Trakt.
- Caveat that is *not* CORS: Trakt's token exchange requires `client_secret` (no
  PKCE support), so the secret ships in the client bundle on every platform. This
  is normal for Trakt's ecosystem (their API docs assume open-source clients embed
  it), but it's worth knowing it isn't secret in practice.

## Probes

```sh
curl -i -X OPTIONS https://api.trakt.tv/movies/trending \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type, trakt-api-key, trakt-api-version, authorization"

curl -i -X OPTIONS https://api.trakt.tv/oauth/token \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```
