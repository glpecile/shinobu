# Web CORS: Hardcover — fully browser-callable, no proxy

**Verified:** 2026-11-12, via `curl` with an `Origin` header against the live
GraphQL, token, revoke and discovery endpoints (issue #396, plan 0117 B0). All
probes were unauthenticated. The app is not registered yet, so nothing below
used a real client id or token.

## Findings

| Endpoint | Probe | Result |
| --- | --- | --- |
| `OPTIONS api.hardcover.app/v1/graphql` | preflight, `POST`, `content-type, authorization` | 200, `access-control-allow-origin: *`, both headers allowed, `access-control-max-age: 7200` |
| `POST api.hardcover.app/v1/graphql` | invalid bearer token | 401 `invalid_token`, `access-control-allow-origin: *` on the error too |
| `OPTIONS api.hardcover.app/oauth2/token` | preflight, `POST`, `content-type` | 200, `access-control-allow-origin: *`, `GET, POST, OPTIONS` |
| `POST api.hardcover.app/oauth2/token` | bogus client, form body and JSON body | 401 `invalid_client`, `access-control-allow-origin: *` |
| `OPTIONS` and `POST api.hardcover.app/oauth2/revoke` | same as the token endpoint | same as the token endpoint |
| `GET api.hardcover.app/.well-known/oauth-authorization-server` | `Origin` header | 200, readable from the browser |

- **The token endpoint passes.** AniList's does not
  (`web-cors-anilist.md`), which was the reason for this probe. Web runs the
  same authorization-code and PKCE flow as native.
- **Rate-limit headers are exposed on GraphQL.**
  `access-control-expose-headers` lists `RateLimit-Policy`, `RateLimit`,
  `Retry-After`, `X-RateLimit-Limit`, `-Remaining`, `-Reset` and the three
  `X-RateLimit-Daily-*` headers. Their values are unverified: a 401 carries
  none of them.
- **Nothing is exposed on the token and revoke endpoints** for an ordinary
  origin. A 429 from a refresh can't read `Retry-After` on web, so the refresh
  path needs a fixed backoff there.
- **Two CORS policies exist.** `http://localhost:<port>` and
  `https://hardcover.app` get their origin echoed, every method, and the full
  expose list on every endpoint. Every other origin (`https://example.com`,
  `http://127.0.0.1:8081`, `null`) gets `*` and `GET, POST, OPTIONS`. Local
  web dev therefore sees more than production does. Probe with a non-localhost
  origin before trusting a header on web.
- **`*` rules out credentialed requests.** The token endpoint also sets
  `_clientverse_session` and `XSRF-TOKEN` cookies. Never send
  `credentials: 'include'`: the browser rejects `*` with credentials.
- **Discovery document:** `issuer` is `https://api.hardcover.app`,
  `code_challenge_methods_supported` is `["S256"]`,
  `token_endpoint_auth_methods_supported` includes `none` (a public client),
  and `authorization_response_iss_parameter_supported` is `true`.
  `scopes_supported` lists `offline_access`, which the OAuth docs never
  mention.

## Consequences

- Hardcover reads and writes run in the browser with the same transport as
  native. No Worker, no "connect on mobile", no `unsupportedWritePlatforms`
  entry.
- Request `read:me:content`, not `read:me`. `users.email` is readable with
  `read:me` or `read:me:email` (`capability-field-scopes.json` in
  `hardcoverapp/hardcover-docs`), and Shinobu needs only the id, username and
  image.

## The registered app

One "Mobile, desktop, or CLI" registration holds both `shinobu://redirect`
and `https://shinobu.glpecile.xyz/?oauth=hardcover`, so native and web share
`EXPO_PUBLIC_HARDCOVER_CLIENT_ID`. Probed with that id on 2026-11-12:

- `POST /oauth2/token` with a bogus code returns 400 `invalid_grant`, not
  `invalid_client`. The server accepts the client with no secret.
- `POST /oauth2/device` returns 401 `unauthorized_client`. The device grant
  is off.

## Still open, needs the first real connect

1. Whether the token response carries a `refresh_token` without
   `offline_access` in the requested scopes.
2. That the authorize redirect carries `iss=https://api.hardcover.app`. The
   discovery document says it does.
3. The live `RateLimit` values.

## Re-probe

```sh
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, authorization" \
  https://api.hardcover.app/v1/graphql
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  https://api.hardcover.app/oauth2/token
curl -s -D - -X POST -H "Origin: https://example.com" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'grant_type=refresh_token&refresh_token=hc_rt_bogus&client_id=bogus' \
  https://api.hardcover.app/oauth2/token
```

If either endpoint stops sending `access-control-allow-origin`, Hardcover
becomes native-only on web. It is never proxied (AGENTS.md).
