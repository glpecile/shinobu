# 0115 — Undo a log

Direction spike, 2026-10-31, against `origin/main`. This is a design doc. It
changes no application code and made no provider writes. No removal endpoint was
called on a real account.

A log fans out to up to three providers, and nothing reverses it. A wrong
episode or wrong cour gets fixed by hand on each tracker. This doc asks whether
an "Undo" on the post-log toast can reverse one just-written log on each
provider, and what that costs.

**Verdict: feasible on 2 of 5 providers today (Trakt, AniList).** Letterboxd
could become the third after one account-bound capture. Simkl and Serializd stay
manual. Every movie and TV log also targets at least one provider that stays
manual (Simkl, plus Letterboxd or Serializd), so in v1 an Undo would usually
revert one provider and link to the others. Recommendation: run the Letterboxd
capture first, then build only the single-log toast Undo described below. Don't
let it compete with #227 pause/drop (`todos/README.md`).

## Capability table

The proposed registry value is `logUndo: WriteSupport`, with the same three
states and the same reason for not being a boolean as `watchlistRemove`
([types.ts](../../src/lib/providers/types.ts)). "Precise" means the undo removes
this log and nothing the user had before it.

| Provider | `logUndo` | Why | Source |
| --- | --- | --- | --- |
| Trakt | `'write'` | `POST /sync/history/remove` accepts history ids, so it can remove one play. The log response (`added`/`not_found` counts) carries no id, but every `/sync/history` row has a unique per-log `id`, so undo looks it up first and then removes it. | [trakt/writes.ts](../../src/lib/providers/trakt/writes.ts) `TraktSyncHistoryResponse`; [trakt/normalize.ts](../../src/lib/providers/trakt/normalize.ts) `TraktHistoryItem.id`. The `ids` body is confirmed by community clients ([gist](https://gist.github.com/blaulan/50d462696bce5da9225b8d596a8c6fb4)). The official page (trakt.docs.apiary.io, sync › remove from history) was unreachable from this session, so check it before building. |
| AniList | `'write'` | A log overwrites `status`/`progress`/`repeat` on one entry. `logToAniList` already reads the entry fresh before writing, so the previous values are in hand. Undo saves them back, or deletes the entry when there was none. | [anilist/writes.ts](../../src/lib/providers/anilist/writes.ts) `logToAniList`, `deleteAniListEntry`; `DeleteMediaListEntry(id)` confirmed by live introspection (plan 0031 R34). |
| Letterboxd | `'manual'` | The diary POST answers `200 {logEntry, messages}`, and the bridge relays the full body, but the adapter discards it. No delete request for a diary entry has been captured from the site's `/api/v0`. Shinobu has no OAuth API key, so the public API isn't an option. | [letterboxd-no-api-fallback.md](../solutions/letterboxd-no-api-fallback.md); [letterboxd/writes.ts](../../src/lib/providers/letterboxd/writes.ts) `interpretDiaryResponse`. |
| Serializd | `'manual'` | A log is `episode_log/add` plus a `show/reviews/add` diary entry. `episode_log/remove` is documented and allowlisted, but no diary-entry delete is known, and the add's response shape (any review id) is unrecorded. With `/progress` gone (404), Shinobu can't tell whether the episode was watched before, so the remove might un-watch an earlier watch. | [Plan 0017 appendix](0017-serializd-provider.md); [serializd-watchlist-clears-watched.md](../solutions/serializd-watchlist-clears-watched.md); [worker/serializd-proxy.ts](../../worker/serializd-proxy.ts). |
| Simkl | `'manual'` | `POST /sync/history/remove` is the only removal. A whole-item body deletes the library entry, its history and the rating. An episode-level body removes those episodes' records, but Simkl keeps one record per episode and reconcile never reads Simkl first, so a re-log's undo would delete the earlier watch too. A removal POST also has to wait out the ~20 s write lock. | [simkl-watchlist-remove-deletes-history.md](../solutions/simkl-watchlist-remove-deletes-history.md); [simkl-rate-limits-and-write-lock.md](../solutions/simkl-rate-limits-and-write-lock.md); [use-log-media.ts](../../src/features/log-media/use-log-media.ts) `providerHasWatch` (no Simkl branch). |

`'none'` fits no provider: every provider that writes a log can undo it by hand
on its site, so `'manual'` is the floor. Letterboxd's
`unsupportedWritePlatforms: ['web']` already covers every verb, so a web undo
without the userscript would be manual even after a flip.

### Per-provider notes

**Trakt.** The lookup runs at undo time, not at log time, so the logs nobody
undoes pay nothing. `getMovieHistory` (`/sync/history/movies/{id}`) already
exists. Episodes need `/sync/history/shows/{id}` filtered by season and number.
Match rows on the item, the episode, and the `watched_at` that was sent. Today
`logToTrakt` omits `watched_at` when the user picked no date, so Trakt stamps
server time. Undo then has only a time window to match against. Stamping the
client instant on every Trakt write makes the match exact (open question 6).
Remove one id per logged episode, the newest when several rows match, never
every row. A rewatch that Trakt declined ("Disable Multiple Plays" → `skipped`)
wrote nothing, so there is nothing to undo.

**AniList.** The save returns the entry `id`. The undo has two branches:

- No entry before the log: `DeleteMediaListEntry` on that id.
- An entry existed: `SaveMediaListEntry(mediaId, status, progress, repeat)` with
  the previous values.

Both follow the existing remove guard rule: a fresh `getEntryState`
immediately before the mutation, never the cache. Proceed only if the entry
still holds what the log wrote (compare-and-swap). Otherwise skip with
"changed since you logged" and the manual link. Two things are unverified:

- Whether AniList fills `startedAt`/`completedAt` itself when a status changes
  through the API.
- Whether `SaveMediaListEntry` nulls fields it isn't sent (plan 0031 KTD-2's
  named risk, the same question #227 must answer).

Capture both dates before the write and probe them on the test account before
claiming the restore is exact.

**Letterboxd.** Two things would flip this to `'write'`. First, a capture by
`app/dev/letterboxd-watchlist-spike`'s method (plan 0031 U6): the request
behind the site's own "delete diary entry" control. Second, the
`logEntry` shape, to confirm it carries that entry's id. Each undo then costs one
more hidden WebView film-page load on native, or a new userscript verb plus a
bridge-revision bump on web. Whether deleting the diary entry also clears the
film's watched mark and like is unknown. Treat the capture as the source.

**Serializd.** A diary-entry delete would need an endpoint found the way
`serializd-watchlist-endpoints.md` found the watchlist routes, then a new
exact-match POST rule in the Worker. That widens a reviewed security artifact
and needs the owner's grant, as plan 0017's watchlist amendment did. Even then,
`episode_log/remove` stays imprecise until a per-show watched read exists.

**Simkl.** The precise path would be an episode-level remove guarded by a fresh
pre-write read showing the episode unwatched. That read is the heavy unfiltered
`/sync/all-items`, the same one reconcile deferred (plan 0034 scope
boundaries). Movies would also lose any rating. Keep it manual until reconcile
gains its Simkl branch, then revisit.

## UX

- **Where.** On the clean single-log toast `LogConfirmSheet` shows after a
  write (`logToastCopy`), as one "Undo" action. It shows only when at least one
  provider in that report's `succeeded` declares `logUndo: 'write'`. The toast
  appears only after `mutateAsync` settles, so every leg has landed by then,
  including a Simkl leg that queued behind the write lock.
- **How long.** About 6 s, against today's 2 s success toast. An action needs
  time to be reached. Pressing Undo dismisses the toast.
- **What it touches.** Only providers in `succeeded`. Reconcile skips, adapter
  skips and failures wrote nothing and are never undone.
- **What it reports.**
  - Every undoable leg lands and nothing else succeeded → `toast.success('Undone',
    'Trakt, AniList')`.
  - A succeeded provider is `'manual'`, or an undo leg fails or skips → the
    log sheet's `WriteResultReport` drawer opens. It shows one row per such
    provider, with `providerItemUrl` from `manualLinkForOutcome`. A link can't
    live in a toast (R7), so the drawer is the no-dead-end surface, as it already
    is for log failures.
- **What it doesn't do.** No Undo on the diary or after the toast has gone, no
  persisted undo queue, no redo.

This conflicts with plan 0032 R7 and the `@/lib/toast` docblock: "Nothing that
needs a tap lives in a toast". R7's premise was `burnt`, which had no press
handler. The app now runs Sonner on both platforms, which does have one, but
the docblock keeps R7 as a deliberate choice. Building this means amending R7
to allow exactly one action, Undo, through a new `toast.undoable(title,
message, onUndo)` verb. Links stay banned from toasts (open question 1). One
more thing needs a device check: whether a pressable inside
`toast.custom(<ToastCard/>)` stays responsive under sonner-native's swipe
gesture.

## State captured at write time

The receipt rides on the success outcome, in memory only, for the life of the
toast. `ProviderWriteResult`'s `ok` member gains an optional `undo` receipt,
next to its existing optional `reason`. `runProviderWrites` passes it through,
and `LogMediaResult.outcomes` carries it to the sheet. No component sees an
`Effect`. Each receipt is a plain object.

| Provider | Receipt | Captured from |
| --- | --- | --- |
| Trakt | `{ ids, type, episodes, watchedAt }`. `watchedAt` is exact once stamped, else a `[sentAt, landedAt]` window. | `logToTrakt`'s inputs. History ids are looked up at undo time. |
| AniList | `{ mediaId, entryId, before: { status, progress, repeat, startedAt, completedAt } \| null, wrote: { status, progress, repeat } }` | `getEntryState` (already read in `logToAniList`) and `SaveMediaListEntry.id`. `completedAt` needs adding to that query. |
| Letterboxd (after the capture) | `{ filmPath, logEntryId }` | The `logEntry` in the diary POST's body. |
| Serializd, Simkl | none | — |

Undo is a verb on the shared core, like the watchlist verbs: `UNDO_ADAPTERS`
passed to `runProviderWrites`, with `WriteCapability` gaining `'log-undo'`
mapped to `logUndo` in `routing.ts`'s `writeSupport`. Its hook follows plan
023's Effect boundary, like `use-unwatchlist-media.ts`. AGENTS.md's
"`useLogMedia` is the only write hook" is already out of date because of the
watchlist hooks, and the build PR should correct it. After an undo,
`invalidateAfterLog` runs again for the undone providers, and the Trakt
`showProgress` watched keys that `useLogMedia` ticked optimistically are
removed.

## Risks

- **Simkl's coarse removal.** A whole-item remove deletes history and rating.
  An episode remove can't tell this log from an earlier watch. That's why Simkl
  is `'manual'`. Simkl needs no setup (bundled client id), so it is likely
  the most common target, and its users will see a manual Simkl row after
  every Undo. That's the main
  reason the payoff is modest.
- **Trakt duplicate plays.** Two rows can share an item, episode and
  `watched_at`: a double log, a backdated re-log, or a scrobbler on another
  device in the same window. The undo removes one row per episode (the newest
  id), so the worst case leaves one duplicate, never a lost watch. Removing by
  item ids instead would delete every play and is never used.
- **The catch-up chain.** Per-episode undo doesn't line up with how two of the
  providers write:
  - AniList folds a chain into one counter write (`anilist-write-queue.ts`),
    and Simkl coalesces it into one POST. Undoing episode 4 of 1–8 has no
    precise meaning on either.
  - The chain's toasts fire after the sheet closes or at its end ("Caught
    up").

  v1 offers no Undo on chain toasts (open question 4).
- **Derived watchlist removal.** A film log also fires
  `removeWatchedFromWatchlist`, unawaited and unreported. Undo doesn't put the
  film back on any watchlist (open question 5).
- **Offline or failed undo.** Each undo leg fails on its own and reaches the
  drawer as that provider's outcome with its link, never a silent failure. There
  is no retry queue. Killing the app drops the receipt along with the toast.
- **Rate limits.** An undo costs two requests on Trakt (lookup and remove) and
  two on AniList (guard read and mutation). That stays well inside both budgets
  for one tap. Undo never fires on its own, so it adds no retry pressure
  (`anilist-rate-limit-retry-storm.md`).
- **Races.** An edit on the provider between the log and the Undo (AniList
  progress moved, a Trakt row deleted elsewhere) turns into a reasoned skip from
  the fresh guard read, not a blind overwrite.

## Open questions

1. **Amend R7 to allow one Undo action on log toasts?** Recommend yes, through a
   dedicated `toast.undoable` verb, keeping every link in the drawer.
2. **How long is the window?** Recommend 6 s, fixed, not configurable.
3. **Show Undo when only some providers can undo it?** Recommend yes, as long
   as one succeeded provider is `'write'`, with the drawer listing the rest. If
   none can, show no Undo instead of an action that only opens links.
4. **Undo inside a catch-up chain?** Recommend no for v1: single-log toasts
   only. The chain's ledger already shows each row.
5. **Should undoing a film log re-add it to the watchlists it left?**
   Recommend no for v1. The derived removal isn't reported, so restoring it
   would need its own receipt. Revisit if users notice.
6. **Stamp an explicit `watched_at` on every Trakt log?** Recommend yes. It
   doesn't change what users see, since Trakt records "now" either way, and
   it makes the undo lookup exact.
7. **Accept Simkl's imprecise episode removal for the common next-episode
   case?** Recommend no. Keep it manual until reconcile reads Simkl before
   writing.
8. **Authorize a Serializd diary-delete probe and a Worker allowlist rule?**
   Recommend not now. The `/progress` gap leaves the episode half imprecise
   anyway.
9. **Run the Letterboxd delete capture on the test account before building?**
   Recommend yes, first. It is the only step that raises movie coverage to
   2 of 3 targets. This spike didn't run it because it needs a real account
   write.
10. **Build at 2/5?** Recommend: build after open question 9 answers, whatever
    the result. Trakt and AniList alone undo the AniList leg of every anime
    log and the Trakt leg of every TV and movie log, the legs a mis-tap most
    often lands on. Rank it behind #227.

## Build sketch (if approved)

1. Registry: `logUndo` on `ProviderDescriptor` and the five values above;
   `'log-undo'` in `WriteCapability`.
2. Receipts: the optional `undo` on the `ok` result and outcome; Trakt and
   AniList adapters return theirs; `getEntryState` gains `completedAt`.
3. Adapters: `undoTraktLog` (history lookup + remove by id) and `undoAniListLog`
   (guard read + restore or delete) in each provider's `writes.ts`.
4. Hook and UI: `useUndoLog` over `runProviderWrites`, `toast.undoable`, the R7
   amendment, and the drawer report for manual or failed legs.
5. Tests alongside the existing ones: `trakt/writes.test.ts` (one row of
   several removed), `anilist/writes.test.ts` (restore, delete, changed-since
   skip), `fan-out.test.ts` (receipt passes through).

Effort: L (coarse). A probe on the test account must precede step 3's AniList
restore and step 1's Letterboxd value.
