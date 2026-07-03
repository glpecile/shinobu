---
status: pending
priority: P2
---

# "Up Next" Section — Timezone-Correct Air Dates

Build the "Up Next" section of the unified feed: for each show the user is tracking,
surface the next unwatched episode — but only once it has actually aired.

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
