# AniList's GraphQL endpoint is probed with a GET, so an outage can't fail the link check

**Symptom (2026-09-10).** `bun check:links` (and the link-health workflow,
daily + on PRs touching `src/lib/providers/**`) failed on the AniList GraphQL
endpoint: `got 403, expected 400`. In the app the same outage surfaced on the
home feed's seasonal anime row: `AniList GraphQL errors: The AniList API has
been temporarily disabled due to severe stability issues.` Every PR touching
the provider layer went red for as long as AniList was down.

## What the two answers mean

`POST https://graphql.anilist.co` answers by *API state*: `400` normally
(exists, parsed the request, rejected the empty body), `403` with a
GraphQL-shaped body during the outage:

```json
{ "errors": [ { "message": "The AniList API has been temporarily disabled due to severe stability issues.", "status": 403 } ] }
```

`GET https://graphql.anilist.co` answers by *route*, outage or not:

```json
{ "data": null, "errors": [ { "message": "Not Found.", "hint": "Use POST request to access graphql subdomain.", "status": 404 } ] }
```

The GET body is the endpoint's own router speaking. A moved or dead host
would 404 without that hint.

## Decision (owner, 2026-09-10)

The check exists to catch URL rot, not outages; a first cut that day reported
the 403 as an `OUTAGE` but still exited 1, which kept unrelated PRs red. That
was reverted. The probe is now a **GET expecting 404 plus an `alive` body
pattern** (`/Use POST request to access graphql subdomain/`), so it passes
through an API outage and fails only if the host or its router changes.
`scripts/check-external-urls.ts`'s `alive` field is the general mechanism:
an endpoint whose only session-free answer is an error status proves itself by
its body. The manifest test allows a 404 in `expect` only alongside `alive`.

## Rule of thumb

Rot (404 without the provider's own words, redirect chains, moved pages) →
fix the constant, document the migration. Outage → not this check's job;
probe the endpoint in a way that doesn't depend on the API being enabled.
Never widen `expect` to make a bare error status pass.
