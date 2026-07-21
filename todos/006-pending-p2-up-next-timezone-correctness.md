---
status: pending
priority: P2
---

# "Up Next" Section — Timezone-Correct Air Dates

Build the "Up Next" section of the unified feed: for each show the user is tracking,
surface the next unwatched episode — but only once it has actually aired.

## Progress (2026-07-20)

The timezone-correct comparison — the hard, error-prone part — is **done**:
`lib/time/has-aired.ts` (+ `has-aired.test.ts`) is the single centralized utility,
covers both Trakt and AniList `airingSchedule` shapes, and already gates episode
availability in the season/anime-season accordions. **What remains is the surface:**
there is no dedicated "Up Next" row in the unified feed yet (`features/feed/feed-rows.tsx`
has Your Shows/Anime, Your Watchlist, Trending, Seasonal — no Up Next). The remaining
work is the per-show next-unwatched-episode computation and its feed row, reusing
`hasAired`. Ties into `todos/009` ("Up Next appears").

## Acceptance Criteria

- An episode is only "up next" once its air date/time has passed **in the user's
  local timezone**, not the show's origin timezone, and not a naive date-only string
  comparison. See `AGENTS.md` "Up Next & Timezones."
- Air-date parsing/comparison is centralized in one utility (e.g.
  `lib/time/hasAired.ts`), reused by every provider's normalization step rather than
  reimplemented per provider or per screen.
- Covers both Trakt (TV episodes) and AniList (`airingSchedule`, for currently-airing
  anime) air-date shapes.
- Add test cases for the boundary conditions: an episode that aired earlier today in
  the show's origin timezone but not yet locally, and vice versa (date-line-adjacent
  timezones).
- Any timezone edge case discovered gets written to `docs/solutions/up-next-*.md`.
