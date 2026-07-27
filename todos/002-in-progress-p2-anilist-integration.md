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

## Update (2026-07-27 — plan `docs/plans/0027-anime-season-mapping.md`)

Plan 0011 decision 7's explicit deferral — *"multi-season absolute numbering
defers to a follow-up using ani.zip's episode table"* — **is shipped**. AniList
entry-relative episode numbers are now translated to canonical
`{season, number}` pairs via ani.zip's per-episode table before any
Trakt/Serializd write, so a sequel-season or split-cour entry no longer logs
phantom season-1 history. AniList's own write is unchanged (entry-relative
`progress`), and an unresolvable mapping becomes a reasoned skip with plan
0022's manual link rather than a guessed season. No `season: 1` literal remains
in any AniList-origin write path.

Still deferred (plan 0027 Scope Boundaries): the reverse direction (logging a
canonical season from the Trakt seasons UI into the sibling AniList entry) —
today's drop-AniList rule stands — and the `season: 1` in
`features/notifications/compute-schedule.ts`, which writes to no provider.

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
