# AniList answers 403 during an outage — report it as one

**Symptom (2026-09-10).** `bun check:links` (and the link-health workflow,
daily + on PRs) failed on the AniList GraphQL endpoint: `got 403, expected
400`, followed by the generic advice to update the URL constants. In the app
the same outage surfaced on the home feed's seasonal anime row: `AniList
GraphQL errors: The AniList API has been temporarily disabled due to severe
stability issues.`

## What a 403 means here

`POST https://graphql.anilist.co` with an empty body normally answers `400`
(exists, parsed the request, rejected it). During this outage it answers
`403` with a *GraphQL-shaped* error body:

```json
{ "errors": [ { "message": "The AniList API has been temporarily disabled due to severe stability issues.", "status": 403 } ] }
```

That is the endpoint speaking — a moved or dead URL would 404 or redirect. It
is an outage, which no URL constant can fix.

## Decision (owner, 2026-09-10)

**Still fail — an outage is exactly the thing to know about** — but say so.
Accepting the 403 was rejected: a green check that hides a provider being
down defeats the daily run. `scripts/check-external-urls.ts` grew an optional
`outage` body pattern per check; a match reports `OUTAGE` with the provider's
own message and a "nothing to update, re-run when it recovers" summary,
instead of `FAILED` with instructions to edit the constants. Exit code is 1
either way, so the workflow stays red for as long as AniList is down.

## Rule of thumb

Rot (404, redirect chains, moved pages) → fix the constant, document the
migration. Outage (the provider's own error, in its own shape) → add or reuse
an `outage` pattern so the failure is named correctly, and wait it out. Never
widen `expect` to make an outage pass.
