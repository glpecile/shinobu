# A part-watched Simkl show parked on the watchlist never reached Continue Watching

**Found:** 2026-08-01, owner report after plan 0036 landed. Batman: Caped
Crusader — 10 of 20 episodes watched on Simkl, status `plantowatch` — rendered
in "Up Next to Watch" but not in "Continue Watching", which only ever showed the
one Trakt-sourced row.

This is the third surface to break on the same underlying state as
`docs/solutions/simkl-watchlist-remove-deletes-history.md` (the removal side) and
`docs/solutions/simkl-parked-shows-have-no-next-to-watch.md` (the details side).

## The chain

Simkl holds **one status per item**. A user who parks a part-watched show back on
the watchlist moves it out of `watching` and into `plantowatch` — there is no
second bucket that still remembers the progress. `simklInputs`
(`src/state/queries/up-next.ts`), the leg that feeds Continue Watching, read the
`watching` snapshot only, so the show had no `ProgressUpNextInput` at all. It
reached the calendar section instead, via `simklTrackedItems`, which had already
been reading `watching` ∪ `plantowatch` for the CDN-file intersection a few
functions away.

Plan 0034 U8/R9's docblock gave two reasons for the exclusion. Both were wrong:

- *"Mirroring Trakt, where the watchlist reaches Calendar through the calendar
  leg and never the progress pool."* Trakt's watchlist is a separate list —
  watchlisting a show there never displaces its watch history, so Trakt's
  progress pool genuinely does see every started show. Simkl's `plantowatch` is
  a *status*, so for Simkl the same exclusion also drops started shows. Mirroring
  the shape of Trakt's rule reproduced none of its meaning.
- *"Simkl only populates `next_watch_info` for `watching` items anyway."* Plan
  0036 U8 already disproved this on device: `next_to_watch_info` is present on
  `plantowatch` rows, which is what let the details screen's fallback offer
  "Log S2E1". `getAllItems` sends `next_watch_info=yes` on every status.

## The fix, and why it is gated on progress

`simklInputs` now reads both snapshots and admits the parked rows where
`currentProgress > 0`.

**Only started rows**, because Simkl's `plantowatch` *is* the watchlist. An
un-started row there is something the user decided to watch, not something
waiting one tap away — and `progressEntry` classifies every input it accepts as
`aired`, so admitting the whole bucket would pour the user's entire backlog into
Continue Watching. That is exactly the failure `anilistEntry`'s PLANNING gate
already exists to prevent on the other provider (plan 0019 KTD-3, "without this
gate the user's entire plan-to-watch backlog pours into Continue Watching"). A
non-zero progress is the one fact separating the two cases, and it is the same
number the details screen renders as "10 / 20 episodes".

Checked for the rows this newly admits:

- `nextToWatch` is populated (above), so `simklProgressInput` produces a real
  pointer rather than the bare `{item, source}` that `progressEntry` drops.
- `simklAiredByCount` behaves: it reads `totalEpisodes`, `notAiredEpisodes` and
  `currentProgress`, which `normalizeAllItems` fills from
  `total_episodes_count` / `not_aired_episodes_count` / `watched_episodes_count`
  on every status. A parked 10-of-20 show with a date-less pointer classifies as
  aired by arithmetic, exactly like a `watching` one.
- No double-count: one status per item means a show cannot be in both snapshots.

## The `plantowatch` read is best-effort

`simklInputs` is one settled leg (R7), so a required second fetch would let a
`plantowatch` outage blank the `watching` rows this leg has always carried. It
`.catch(() => null)`s instead. That is not swallowing the error: the calendar and
releases legs read the *same* cache entry through `simklTrackedItems` and settle
their own failure into `errors`, so the outage still surfaces — it just no longer
takes Continue Watching down with it. And the entry is the watchlist gather's
own, so in a session that has opened `/watchlist` the read costs no request
(Simkl's 10 GET/s budget is untouched).

## The rule this generalizes to

Same rule the details-side doc landed on, now with its cross-provider corollary:
**a provider snapshot filtered by status is a filter over which items are
listed, not over which facts are true** — and *"mirror what we do for the other
provider"* is only sound when the other provider's data model actually matches.
Trakt's list and Simkl's status are different objects wearing the same word
("watchlist"), and every rule copied across that gap has to be re-derived, not
transplanted.
