# Up Next: what "aired" means per provider (and what it can't mean)

**Added 2026-07-23** while building the Continue Watching + Calendar sections
(`docs/plans/0019-up-next-calendar-home-feed.md`). `lib/time/has-aired.ts`
answers "has this instant passed for the user"; this file records the provider
shapes feeding it, because two of them can't supply an instant at all and the
naive readings of that are wrong in opposite directions.

## Trakt: `next_episode` needs `extended=full`

`/shows/:id/progress/watched` returns a `next_episode` pointer, but the bare
response gives only `season`, `number`, `title`, `ids` — **no `first_aired`**.
Adding `extended=full` upgrades it to a full episode object (`first_aired`,
`runtime`, `episode_type`), at no extra request. Without it there is nothing to
compare and every entry would have to be assumed aired.

Two behaviors of that endpoint matter for Up Next:

- The **stats** (`aired`/`completed` and the `seasons` breakdown) ignore future
  and air-date-less episodes — but `next_episode` itself does point at an
  *upcoming* episode once the user is caught up on everything aired. That is
  precisely the Calendar population: filtering the pool to "shows the user is
  behind on" would structurally empty it.
- Progress episodes still carry no `season` of their own
  (`trakt-progress-episodes-have-no-season-field.md`); `next_episode` does.

`first_aired: null` (Trakt knows the episode, not when it airs) is carried
through as `null` rather than dropped, and Up Next excludes it from **both**
sections. Unknown is not "aired": showing it in Continue Watching offers a
quick-log for something that may not exist yet, and showing it in Calendar
would need a day it doesn't have.

## AniList: one pointer per series, no instants behind it

`nextAiringEpisode { episode airingAt }` (added to the currently-watching read
so airing data costs zero extra requests against the 30 req/min budget) is the
*only* air instant AniList gives per series. There is no per-episode instant for
episodes that already aired, so classification is a precedence, not a compare:

| next unwatched (`progress + 1`) vs pointer | classification |
|---|---|
| below the pointer | **aired by construction** — no instant exists, and demanding one would hide every back episode |
| at the pointer | `airingAt` is its instant → `hasAired` decides, and **wins over the arithmetic** (a stale cached pointer whose time has passed resolves aired) |
| above the pointer | excluded — the schedule doesn't reach that far |
| no pointer, total known | aired while `progress + 1 <= episodes` |
| no pointer, no total | excluded — hiatus/unconfirmed is unknowable, not "available" |

Note the asymmetry with Trakt: a missing instant excludes a Trakt entry and
*includes* an AniList back-episode. Both follow from the same rule — never
guess — because for Trakt the instant is expected and absent, while for AniList
it is never present for past episodes in the first place.

`airingAt` is Unix **seconds**; it is converted to an ISO instant at
normalization so exactly one date-comparison path exists (plan KTD-4).

## Boundary cases the tests pin

`features/up-next/compute.test.ts` fixes `now` and builds instants with
local-time constructors, so the suite means the same thing in any timezone:

- An episode airing 09:00 JST when it is already "tomorrow" in Tokyo but the
  instant is still an hour away stays **upcoming** — the date matching over
  there proves nothing.
- An instant expressed in a +14:00 offset that reads as "tomorrow" on the
  origin calendar but has already passed counts as **aired**. Instants, not
  calendar dates.
- A date-only `first_aired` is local midnight, never UTC midnight
  (`parseLocalInstant`).
- The Calendar window is *calendar days*, not 7×24h: an instant 40 minutes
  from now that crosses local midnight is "Tomorrow", and day 7 is out of the
  window while day 6 ("In 6 days") is the last one in.
