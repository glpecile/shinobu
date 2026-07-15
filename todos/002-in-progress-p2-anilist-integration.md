---
status: in-progress
priority: P2
---

# AniList Integration

Wire up AniList as a connected provider (`state/session/`): OAuth, the read side
(GraphQL `MediaList(status: CURRENT)` into `useUnifiedFeed`), and a write adapter
(`SaveMediaListEntry` mutation) registered in the provider routing table so
`todos/005`'s `useLogMedia` can fan out to it. Normalize responses into
`NormalizedMediaItem` (`types/media.ts`).

## Progress (2026-07-14 — plan `docs/plans/0011-anilist-integration.md`)

Code is in: provider lib (`lib/providers/anilist/`), otraku-style implicit-grant
auth, feed rows (Your Anime + Trending Anime), the ani.zip identity mapping,
and the reconcile/rewatch fan-out. Unit-tested; **not yet live-verified**.

Remaining before this closes:

- [ ] Register the Shinobu AniList API clients (one per redirect URL — native
      `shinobu://redirect`, web `SHINOBU_WEB_DOMAIN`, plus a personal localhost
      dev client) and fill the ids into `lib/providers/anilist/config.ts`.
- [ ] Live pass: one-tap connect on native + web; Your Anime renders; anime
      film logs to Trakt+AniList; catch-up skip and parity rewatch behave per
      plan 0011 decision 7.
- [ ] Any GraphQL boundary quirks or paging mismatches discovered get written
      to `docs/solutions/anilist-*.md`.

## Acceptance Criteria

- Anime/manga progress renders in the unified feed via a `useCurrentAnimeQuery`
  hook (`state/queries/anilist.ts`). ✓ (anime; manga row is out of scope,
  plan 0011)
- Title matching handles both standard and Romanized titles. ✓
  (`anilistTitle`: english → romaji → native)
- An AniList write adapter exists (`lib/providers/anilist/writes.ts`)
  implementing "log an anime episode/film" and "log a manga chapter" for the
  fan-out to call, including the anime-film case that also routes to
  Trakt/Letterboxd (`plan.md` 1.3). ✓
- Any GraphQL boundary quirks or paging mismatches discovered get written to
  `docs/solutions/anilist-*.md` before this todo is closed.
