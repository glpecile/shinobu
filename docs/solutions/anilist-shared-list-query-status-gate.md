# Widening the AniList list read: one query, two consumers, and the status the normalizer ate

## Symptom (the one this prevented)

Plan 0030 needed plan-to-watch anime in Calendar, so
`MediaListCollection(status: CURRENT)` widens to
`status_in: [CURRENT, PLANNING]`. Done naively that produces two regressions,
the second severe:

1. The "Your Anime" home row lists plan-to-watch titles as currently watching.
2. **Every plan-to-watch title the user has ever added appears in Continue
   Watching**, labelled as aired and one tap from a quick log.

## Root cause

Two independent facts that only bite together:

- **One request feeds two consumers.** `anilistQueryKeys.currentAnimeEntries()`
  is the network read; the "Your Anime" row derives from it and Up Next reads
  the richer shape (plan 0019 U2). That sharing is deliberate — the 30 req/min
  budget (`anilist-rate-limit-retry-storm.md`) forbids a second PLANNING read —
  so *whatever* the query widens to, both consumers get.
- **`normalizeCurrentAnimeEntry` selected `status` and then dropped it.**
  `AniListCurrentEntry` had no status field at all, so nothing downstream could
  distinguish the two. The status was only ever implied by the query's
  hardcoded `CURRENT`.

Regression 2's mechanism is the non-obvious one. A PLANNING entry has
`progress: 0`, so Up Next computes `next = 1`; if the series is mid-run,
`nextAiringEpisode.episode` is (say) 5, and `next < airing.episode` is the
"below the pointer → aired **by construction**" branch — correct reasoning for
someone four episodes behind, catastrophic for someone who has watched none.
Nothing about it is type-visible: the entry is well-formed and the classifier
is doing exactly what it was written to do.

## Fix

Three pieces, none of which works alone:

1. `AniListCurrentEntry` carries `status: 'CURRENT' | 'PLANNING'`
   (`lib/providers/anilist/normalize.ts`). Anything not explicitly `PLANNING`
   normalizes to `CURRENT` — PLANNING is the *restricted* status, so guessing it
   would silently hide series the user is watching.
2. The row filters at its selector, not at the read: `fetchCurrentAnime`
   (`state/queries/anilist.ts`) keeps only `CURRENT`. One cached request, two
   slices.
3. `anilistEntry` (`features/up-next/compute.ts`) classifies status-blind and
   then gates: a PLANNING entry that did not classify as `upcoming` returns
   `null`. A mid-run PLANNING series therefore yields **nothing at all** — it is
   not up next (nothing was started) and episode 1 airing weeks ago is not a
   calendar event.

The gate also matters for dedupe: only *surviving* AniList entries suppress
their Trakt twin, so a gated PLANNING entry must not take an actively-watched
Trakt card down with it.

## Amendment (2026-07-28, plan 0031 U12): a third consumer, same gate

The text above says PLANNING is *for* Calendar. That was true when Calendar was
the only thing that wanted it; it is now one of two. Plan 0031 adds
`fetchPlannedAnime` (`state/queries/anilist.ts`) — the AniList leg of the
cross-provider watchlist — as a **third selector over the same cached
`currentAnimeEntries()` read**, costing 0 extra requests for exactly the reason
0030 widened with `status_in` in the first place.

State the invariant consumer-agnostically, because the count will keep moving:

> **The gate is about what PLANNING may *reach*, not about how many things read
> it.** A plan-to-watch entry may reach surfaces that mean "you intend to watch
> this" — Calendar (it airs this week) and the watchlist (it is on your list).
> It may never reach a surface that means "you are partway through this":
> Continue Watching or the "Your Anime" row. Adding a consumer means adding a
> slice; it never means widening an existing one.

The load-bearing lines stay exactly where they were —
`fetchCurrentAnime`'s `status === 'CURRENT'` filter and `anilistEntry`'s
`status === 'PLANNING' && entry.status !== 'upcoming'` gate — and the
three-way test in `state/queries/anilist.test.ts` names this file so that a
future "PLANNING is displayed now anyway, delete the gate" simplification fails
a test that explains itself.

## Rule of thumb

When a provider read is shared by two consumers on a budget, **widening the
query is a change to every consumer**. Carry the discriminating field through
normalization first, filter per consumer second — and check what the *derived*
fields (here `progress: 0`) mean for the newly admitted rows before assuming
the existing classifier still holds.
