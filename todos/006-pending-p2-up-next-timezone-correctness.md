---
status: pending
priority: P2
---

# "Up Next" Section — Timezone-Correct Air Dates

Build the "Up Next" section of the unified feed: for each show the user is tracking,
surface the next unwatched episode — but only once it has actually aired.

## Progress (2026-07-23) — surface shipped

The surface half is built (`docs/plans/0019-up-next-calendar-home-feed.md`): the
per-show next-unwatched-episode computation lives in `features/up-next/compute.ts`
(pure, `now` injected), fed by a `state/queries/up-next.ts` slot that pools the ~20
most recently watched Trakt shows plus the AniList currently-watching list. It splits
into **Continue Watching** (aired, quick-loggable through the `useLogMedia` fan-out)
and **Calendar** (unaired, within the local 7-day window). Three treatments were
prototyped on the home route and compared against real data; the owner picked the
**7-day week strip** (2026-07-23) and the other two were deleted —
`features/up-next/up-next-section.tsx` is now the single surface.

Every acceptance criterion below is discharged and covered by
`features/up-next/compute.test.ts` + `lib/time/relative-day.test.ts`; provider-shape
findings are written up in `docs/solutions/up-next-airing-classification.md`.

**Remaining:** the notification build-out in `todos/007`, which now has data to
schedule from, and TMDB per-episode stills on the cards (they use the show backdrop
for now).

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
