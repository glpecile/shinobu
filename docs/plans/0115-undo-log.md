# 0115 — Undo a log

Direction spike, 2026-10-31, against `origin/main`. Design only: no application
code changed and no removal endpoint was called on a real account.

A log fans out to every connected provider for its type (up to four for an
anime film), and nothing reverses it. A wrong episode or cour is fixed by hand
on each tracker. Can an "Undo" on the post-log toast reverse one just-written
log, and at what cost?

**Verdict: feasible on 2 of 5 providers today (Trakt, AniList).** Letterboxd
could be third after one account-bound capture. Simkl and Serializd stay
manual, so a user connected to either sees Undo revert some legs and link to
the rest. Recommendation: run the Letterboxd capture, then build only the
single-log toast Undo below, ranked behind #227 pause/drop (`todos/README.md`).

## Capability table

Registry value `logUndo: WriteSupport`, as `watchlistRemove`
([types.ts](../../src/lib/providers/types.ts)). Precise means it removes this
log and nothing the user had before it.

| Provider | `logUndo` | Why | Source |
| --- | --- | --- | --- |
| Trakt | `'write'` | `POST /sync/history/remove` accepts history ids, so it can remove one play. The log response has no id, but every `/sync/history` row has one, so undo looks it up first. | [trakt/writes.ts](../../src/lib/providers/trakt/writes.ts) `TraktSyncHistoryResponse`; [trakt/normalize.ts](../../src/lib/providers/trakt/normalize.ts) `TraktHistoryItem.id`. The `ids` body is confirmed by community clients ([gist](https://gist.github.com/blaulan/50d462696bce5da9225b8d596a8c6fb4)); check the official apiary page before building. |
| AniList | `'write'` | A log overwrites `status`/`progress`/`repeat` on one entry. `logToAniList` already reads the entry first, so the previous values are in hand. Undo saves them back, or deletes the entry when there was none. | [anilist/writes.ts](../../src/lib/providers/anilist/writes.ts) `logToAniList`, `deleteAniListEntry`; `DeleteMediaListEntry(id)` confirmed by introspection (plan 0031 R34). |
| Letterboxd | `'manual'` | The diary POST answers `200 {logEntry, messages}` and the bridge relays it, but the adapter discards it. No diary-entry delete has been captured from `/api/v0`, and Shinobu has no public API key. | [letterboxd-no-api-fallback.md](../solutions/letterboxd-no-api-fallback.md); [letterboxd/writes.ts](../../src/lib/providers/letterboxd/writes.ts) `interpretDiaryResponse`. |
| Serializd | `'manual'` | A log is `episode_log/add` plus a `show/reviews/add` diary entry. `episode_log/remove` is allowlisted, but no diary delete is known, and with `/progress` gone (404) Shinobu can't tell whether the episode was watched before, so the remove might un-watch an earlier watch. A diary delete would also need a new Worker rule and the owner's grant. | [Plan 0017 appendix](0017-serializd-provider.md); [serializd-watchlist-clears-watched.md](../solutions/serializd-watchlist-clears-watched.md); [worker/serializd-proxy.ts](../../worker/serializd-proxy.ts). |
| Simkl | `'manual'` | `POST /sync/history/remove` is the only removal. A whole-item body deletes the library entry, history and rating. An episode body removes every record of those episodes, and reconcile never reads Simkl first, so a re-log's undo would delete the earlier watch too. Revisit once reconcile reads Simkl. | [simkl-watchlist-remove-deletes-history.md](../solutions/simkl-watchlist-remove-deletes-history.md); [simkl-rate-limits-and-write-lock.md](../solutions/simkl-rate-limits-and-write-lock.md); [use-log-media.ts](../../src/features/log-media/use-log-media.ts) `providerHasWatch` (no Simkl branch). |

### Trakt

Undo looks the row up at undo time, so logs nobody undoes cost nothing.
`getMovieHistory` (`/sync/history/movies/{id}`) exists; episodes need
`/sync/history/shows/{id}`. History is sorted by `watched_at`, so a backdated
log can sit past the first page: query with `start_at`/`end_at` bracketing the
sent `watched_at` (unverified, check the docs) rather than filtering page one.

`logToTrakt` omits `watched_at` when no date was picked, so Trakt stamps server
time, and a client-side window can't match it under clock skew. The build
therefore always sends the client instant as `watched_at`. Users see no
difference. Match on item, episode and that instant, and remove one id per
logged episode, the newest when several match, never every row. A rewatch
Trakt `skipped` ("Disable Multiple Plays") wrote nothing to undo.

### AniList

The save returns the entry `id`. With no entry before the log, undo calls
`DeleteMediaListEntry`. Otherwise it saves the previous `status`, `progress`
and `repeat`. Either way it first does a fresh `getEntryState` and proceeds only
if the entry still holds what the log wrote; otherwise it skips with "changed
since you logged" and the manual link.

The undo goes through `anilist-write-queue.ts`, which keeps one AniList write in
flight. A queued later log of the same entry would otherwise land after the
undo, or the undo would roll it back. When the queue folds several logs into one
write, every caller gets the same receipt, so undoing one would undo all of
them: a folded receipt makes the AniList leg `'manual'` for that toast.

Unverified, probe on the test account before claiming the restore is exact:
whether AniList fills `startedAt`/`completedAt` on a status change, and whether
`SaveMediaListEntry` nulls fields it isn't sent (plan 0031 KTD-2, the same
question #227 must answer).

### Letterboxd

Flips to `'write'` once the request behind the site's "delete diary entry"
control is captured with `src/app/dev/letterboxd-watchlist-spike`'s method
(plan 0031 U6), and `logEntry` is confirmed to carry that entry's id.

## UX

- **Where.** An "Undo" action on the clean success toast `LogConfirmForm` shows
  after a write (`logToastCopy`), only when a provider in `succeeded` has
  `logUndo: 'write'`. That toast appears after `mutateAsync` settles, so every
  leg has landed. There is no Undo when the log leads to a completion offer
  (no toast), on a partial-failure `toast.error`, or on catch-up chain toasts,
  whose AniList and Simkl writes collapse a chain into one.
- **How long.** About 6 s, fixed, against today's 2 s. Pressing Undo dismisses
  the toast.
- **What it touches.** Only providers in `succeeded`. Skips and failures wrote
  nothing.
- **What it reports.** All undo legs land and no succeeded provider is
  `'manual'` → `toast.success('Undone', 'Trakt, AniList')`. Otherwise the sheet
  is already closed, so the press opens a `components/sheet` with a
  `WriteResultReport` row per manual, failed or skipped provider, each linking
  through `manualLinkForOutcome`. Never a dead end, and no link in a toast.
- **Not in v1.** Undo after the toast is gone, a persisted queue, redo, or
  re-adding a film to watchlists `removeWatchedFromWatchlist` took it off.

This amends plan 0032 R7 and the `@/lib/toast` docblock ("Nothing that needs a
tap lives in a toast"), whose premise was `burnt` having no press handler.
Sonner does, so allow exactly one action, Undo, as an optional `onUndo` on
`toast.success`. Check on device that a pressable inside
`toast.custom(<ToastCard/>)` survives sonner-native's swipe gesture.

## Receipts

In memory only, for the life of the toast. `ProviderWriteResult`'s `ok` member
gains an optional `undo` receipt next to `reason`; `runProviderWrites` passes it
through to `LogMediaResult.outcomes`. Plain objects, no `Effect`.

| Provider | Receipt | Captured from |
| --- | --- | --- |
| Trakt | `{ ids, type, episodes, watchedAt }` | `logToTrakt`'s inputs |
| AniList | `{ mediaId, entryId, before: { status, progress, repeat, startedAt, completedAt } \| null, wrote: { status, progress, repeat }, folded }` | `getEntryState` (gains `completedAt`), `SaveMediaListEntry.id`, the write queue |

Undo is a verb on the shared core like the watchlist verbs: `UNDO_ADAPTERS`
passed to `runProviderWrites`, and `WriteCapability` gains `'log-undo'` mapped
to `logUndo` in `routing.ts`. The hook keeps Effect behind `runPromise` like
`use-unwatchlist-media.ts`. After an undo, `invalidateAfterLog` runs for the
undone providers and the Trakt `showProgress` keys `useLogMedia` ticked
optimistically are cleared.

## Risks

- **Modest payoff.** Simkl needs no setup, so it is likely the most common
  target, and its users see a manual Simkl row after every Undo.
- **Trakt duplicates.** Two rows can share item, episode and `watched_at` (a
  double log, or a scrobbler in the same second). Undo removes one, so the
  worst case leaves a duplicate, never a lost watch.

## Open questions

1. **Amend R7 for one Undo action on log toasts?** Recommend yes, links stay out.
2. **Run the Letterboxd delete capture on the test account first?** Recommend
   yes. It's the only step that raises movie coverage, and needs a real
   account write.
3. **Build at 2/5?** Recommend yes after question 2, whatever the result.
   Trakt and AniList cover the Trakt leg of every movie and TV log and the
   AniList leg of every anime log.

## Build sketch (if approved)

1. Registry: `logUndo` on `ProviderDescriptor`; `'log-undo'` in
   `WriteCapability`.
2. Receipts on the `ok` result; `logToTrakt` always sends `watched_at`;
   `getEntryState` gains `completedAt`; the AniList queue reports `folded`.
3. `undoTraktLog` (ranged lookup, remove by id) and `undoAniListLog` (queued
   guard read, restore or delete) in each `writes.ts`.
4. `useUndoLog`, `onUndo` on `toast.success`, the R7 amendment, and the report
   sheet.
5. Tests beside the existing ones: `trakt/writes.test.ts` (one row of several
   removed), `anilist/writes.test.ts` (restore, delete, changed-since skip),
   `fan-out.test.ts` (receipt passes through).

Effort: L (coarse). The AniList restore and the Letterboxd value are gated on
test-account probes.
