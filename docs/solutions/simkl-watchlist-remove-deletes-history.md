# Simkl's only un-track deletes watch history, so the removal reads first

**Source:** api.simkl.org `/conventions/list-statuses`, `/api-reference/simkl/remove-from-history`
and `/api-reference/simkl/add-to-list`, read 2026-08-01 (plan 0036). This resolves
the "single-status semantics" open item in
`docs/solutions/simkl-rate-limits-and-write-lock.md` and the `watchlistRemove`
gate plan 0034 U4 left on the registry.

## The finding

Simkl holds **one status per item** — `watching`, `plantowatch`, `hold`,
`dropped`, `completed` (movies omit `watching`/`hold`). "Watchlist" is that
`plantowatch` status, not a separate list.

There is **no status-only removal**. The docs are explicit:

> To remove an item, use `POST /sync/history/remove` — not `POST /sync/add-to-list`
> with `to: "remove"`.

and, on that endpoint, a whole-item body (ids, no `seasons`/`episodes`):

> the item is **removed from the user's library entirely** (any watch history AND
> the watchlist entry). Equivalent to the user clicking "Remove from list" on the
> title page.

> Removing also clears the rating.

A `to: "remove"` value is still accepted by `add-to-list` for backwards
compatibility but is **undocumented and deprecated** — not a way out.

So "remove from watchlist" on Simkl is unavoidably "delete the library entry".

## Why that is mostly harmless, and exactly when it isn't

Under one-status-per-item, a `plantowatch` row normally holds **nothing**:
watching something moves it to `watching` server-side, which is the same reason
`yourShowsSimkl` filters `plantowatch` out of the "Your Shows" merge. The
overwhelmingly common removal has no history and no rating to lose.

The dangerous row is the one a user put **back** on plan-to-watch by hand after
watching part of it. Removing that deletes its episode records — and, because
Simkl's library is what feeds Continue Watching (`watching` snapshot) and This
week (`watching` ∪ `plantowatch` intersected with the CDN calendar), the show
silently vanishes from both surfaces as a side effect of a watchlist edit.

## What the app does about it

`removeFromSimklWatchlist` (`src/lib/providers/simkl/writes.ts`) is the second
adapter after AniList's delete to take plan 0031 R36's **fresh in-effect read**
before writing — here `GET /sync/all-items/all/plantowatch`:

- **Absent from the fresh list → reasoned skip, no POST.** The item is not on the
  watchlist any more (a log promoted it, or another device removed it).
- **Present with watch history → refused** unless the caller passes
  `allowDestructive`, which only an explicit second press in the picker earns
  (the AniList CURRENT precedent, plan 0035 R3). The picker's warning is driven
  by the cached `simklWatchedCount` hint; this read stays the authority.
- **Present with nothing → removes.** With membership already proven,
  `deleted: 0` is `ok`, **not** a skip — a plan-to-watch row has no history rows
  to delete, so treating zero as "wasn't in your library" would call every clean
  removal a no-op. `not_found` remains the only failure signal.

The extra GET also buys the write-lock property below for free.

## The derived post-log removal skips Simkl entirely

`removeWatchedFromWatchlist` (a watched film leaves every watchlist, plan 0033
U7) **filters Simkl out of its targets**. Two reasons, either one sufficient:

- Redundant: the log that just fired already moved the film off `plantowatch`.
- Unsafe: it would be a second `/sync/*` POST inside Simkl's ~20-second per-user
  write lock, fired against a snapshot that may not have caught up with the log
  — and this POST deletes history.

Guard against the empty-list trap when filtering: `resolveWriteTargets` treats an
**empty** `providers` array as "no opt-out given" and falls back to every routed
target, so a film held only by Simkl must return early rather than pass `[]`.

## Rollback

Reverting `PROVIDERS.simkl.watchlistRemove` to `'manual'` in
`src/lib/providers/registry.ts` puts removal back to a deep-link row and leaves
the adapter dormant — one token, the Serializd/Letterboxd precedent.
