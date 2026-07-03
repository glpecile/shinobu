---
status: ready
priority: P2
---

# AniList Integration

Wire up AniList as a connected provider (`state/session/`): OAuth, the read side
(GraphQL `MediaList(status: CURRENT)` into `useUnifiedFeed`), and a write adapter
(`SaveMediaListEntry` mutation) registered in the provider routing table so
`todos/005`'s `useLogMedia` can fan out to it. Normalize responses into
`NormalizedMediaItem` (`types/media.ts`).

## Acceptance Criteria

- Anime/manga progress renders in the unified feed via a `useMediaListQuery` hook
  (`state/queries/anilist.ts`).
- Title matching handles both standard and Romanized titles.
- An AniList write adapter exists (`lib/providers/anilist.ts`) implementing "log an
  anime episode/film" and "log a manga chapter" for `lib/providers/routing.ts` to
  call, including the anime-film case that also routes to Trakt/Letterboxd
  (`plan.md` 1.3) — `todos/005` depends on this existing, not on a UI to trigger it.
- Any GraphQL boundary quirks or paging mismatches discovered get written to
  `docs/solutions/anilist-*.md` before this todo is closed.
