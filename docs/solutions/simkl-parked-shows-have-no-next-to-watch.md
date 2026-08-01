# A Simkl show parked outside `watching` went dark on its own details screen

**Found:** 2026-08-01, owner report during plan 0036's device pass. A show
reading "PROGRESS 10 / 20 episodes" on its details screen had **no log button**
and **no season checkmarks** — the season picker was the only way to log it.

## The chain

Simkl holds **one status per item**, and a user can park a part-watched show
back on the watchlist (`plantowatch`). Everything on the TV details screen that
knows about Simkl progress came from `useSimklWatchingEntryQuery`, which read the
`watching` snapshot **only**:

1. `/sync/all-items/all/watching` doesn't list the show → the entry selects to
   `null`.
2. `nextEpisodeFromSimklEntry(item, null)` handles `progress === 0` (start at
   S1E1) and `progress >= total` (rewatch wrap) — a mid-show count fell through
   to `null`.
3. `useSeriesNextEpisode` maps that to `unavailable`, and `LogMediaButton`
   returns `null` for a series it cannot name an episode for.

The checkmarks went with it: the same hook feeds the per-episode watched keys.

The screen was therefore stating "10 / 20 episodes" and simultaneously behaving
as though it knew nothing about the user's progress.

## Two fixes, because there were two bugs

**1. The read was too narrow.** `useSimklWatchingEntryQuery` now falls back to the
`plantowatch` snapshot when the `watching` one answers "not here". Both are cache
entries other surfaces already hold (Continue Watching; the watchlist gather and
Up Next's calendar intersection), so the common case still costs no request, and
the fallback query is `enabled` only on an actual miss — `data === null`, never
`undefined`, which is still loading.

Verified on device: Simkl **does** populate `next_to_watch` for `plantowatch`
rows. The button came back reading "Log S2E1" for a 10-of-20 show, along with
the season checkmarks and the "Watching · 10 episodes logged" line.

**2. The pointer-less branch claimed too much.** `nextEpisodeFromSimklEntry`
read an entry with no `next_to_watch` as "everything aired is watched" whenever
the aired count was non-zero, and wrapped to a S1E1 **rewatch**. That is only
true if the user has actually caught up. It now returns `null` (unnameable →
season picker) when a *known* aired count exceeds `currentProgress`; an
**unknown** count keeps the rewatch path it always had, deliberately unchanged.

Without fix 2, fix 1 would have been worse than the bug: a 10-of-20 show would
have offered "Log rewatch" of S1E1.

## The rule this generalizes to

A provider snapshot filtered by status is a filter over *which items are listed*,
not over *which facts are true*. Reading one status bucket and treating an
absence as "we know nothing about this show" is how a screen ends up contradicting
the number it is already displaying. Widen the read, or state the narrowness in
what you render — don't silently drop the affordance.

Related: `docs/solutions/simkl-watchlist-remove-deletes-history.md` (the same
parked-show state, from the removal side).
