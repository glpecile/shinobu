---
status: pending
priority: P2
---

# Onboarding — Connect Providers → Up Next Appears

The ideal first-run experience (the product's core promise): the user connects
whichever providers they use, and their in-progress shows/anime immediately show up
in an Up Next-style feed. No account creation, no setup beyond OAuth.

## Acceptance Criteria

- A connect screen lists providers from the registry
  (`src/lib/providers/registry.ts`) — rendered from descriptors, not hardcoded, so a
  future fourth provider appears automatically.
- Connecting any single provider immediately populates the unified feed + Up Next
  (`useUnifiedFeed` refetches on session change); no "connect everything first" gate.
- Disconnecting a provider removes its entries from the feed and its token from
  MMKV.
- Blocked providers surface honestly: Letterboxd shows its state (e.g. "waiting on
  API access", `todos/004`) rather than a broken connect button.

## Known landmine (pre-registered)

Trakt "up next" computation needs a per-show progress call
(`GET /shows/:id/progress/watched`) — an N+1 that will hit rate limits for a user
with hundreds of watched shows. From day one: cache per-show progress aggressively
(TanStack Query `staleTime`), and only compute progress for recently-active shows,
not the full watched history. When this is first hit for real, write the numbers to
`docs/solutions/trakt-progress-n-plus-one.md`.

## Dependencies

Needs at least one provider's read path (`todos/001` or `002`); Up Next quality
depends on `todos/006`.
