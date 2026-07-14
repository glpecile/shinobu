---
status: done
priority: P2
completed: 2026-07-07
---

> **Outcome (2026-07-07):** Trakt PASS (API + OAuth token endpoint, see
> `docs/solutions/web-cors-trakt.md`). AniList GraphQL PASS but its OAuth token
> endpoint blocks browsers → web uses the implicit grant
> (`docs/solutions/web-cors-anilist.md`). No provider failed API-level CORS, so no
> registry platform-availability field was added. Letterboxd deferred until
> `todos/004` unblocks.

# Web CORS Spike — Verify Providers Are Browser-Callable

There is no backend, so the web app must call provider APIs directly from the
browser. That only works if each provider sends CORS headers. Policy (decided,
`docs/plans/0005` + AGENTS.md "Web & CORS"): **a provider that blocks browser
origins is native-only on web** ("connect on mobile") — never proxied.

This spike de-risks that *before* any web read path is built, instead of
discovering it mid-integration.

## Acceptance Criteria

- From a real browser origin (e.g. the Expo web dev server), verify:
  - AniList GraphQL (`https://graphql.anilist.co`) — expected to be
    browser-friendly; confirm rather than assume.
  - Trakt REST (`https://api.trakt.tv`) — both a public GET and a preflighted
    request with the `trakt-api-key`/`trakt-api-version` headers (custom headers
    trigger `OPTIONS` preflight, which is where CORS usually breaks).
  - Letterboxd — only if/when `todos/004` unblocks.
- Also confirm each provider's *OAuth* story works from the browser (redirect URIs
  for a web origin, token exchange callable browser-side).
- Findings written to `docs/solutions/web-cors-<provider>.md` per provider —
  including the passing cases, so the next agent doesn't re-run the spike.
- If a provider fails: mark it native-only for web in the provider registry
  (`src/lib/providers/registry.ts` grows a platform-availability field at that
  point — don't add the field speculatively before a real failure needs it).
