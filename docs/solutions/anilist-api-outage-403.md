# AniList answers 403 during an outage — not a dead endpoint

**Symptom (2026-09-10).** `bun check:links` (and the scheduled link-health
workflow) failed on the AniList GraphQL endpoint: `got 403, expected 400`.
In the app the same outage surfaced as a render error on the home feed's
seasonal anime row: `AniList GraphQL errors: The AniList API has been
temporarily disabled due to severe stability issues.`

## What a 403 means here

`POST https://graphql.anilist.co` with an empty body normally answers `400`
(exists, parsed the request, rejected it). During this outage it answers
`403` with a *GraphQL-shaped* error body:

```json
{ "errors": [ { "message": "The AniList API has been temporarily disabled due to severe stability issues.", "status": 403 } ] }
```

That is the endpoint speaking — a moved or dead URL would 404 or redirect and
never answer in GraphQL's own shape. It is an outage, which no URL constant can
fix, and exactly the false positive the link check should not raise.

## Fix

`scripts/check-external-urls.ts` accepts `403` for the GraphQL endpoint
alongside `400`. The setup and authorize pages keep their strict expectations.

## Rule of thumb

The link check is for **rot** (404s, redirect chains into 404s, moved pages).
A provider's own error status with a provider-shaped body is liveness, not
rot — widen `expect` and record the status here rather than retrying CI until
the provider recovers.
