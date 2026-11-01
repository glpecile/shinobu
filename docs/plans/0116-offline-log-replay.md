# 0116 — Offline log replay (spike)

Direction spike for [#208](https://github.com/glpecile/shinobu/issues/208),
the open row in `todos/README.md`: "durable write replay does not ship. Plan
the smallest restart-safe action with per-provider outcomes and
account/duplicate protections." This document is the plan. It changes no
application code.

Recommendation: persist a small **pending-log record** in its own MMKV file,
written before the fan-out starts and settled per provider when it ends.
Replay sends it back through `useLogMedia` (so it goes through reconcile)
oldest first, one record at a time. Don't persist TanStack paused mutations.
Replay a provider leg automatically only when nothing can have landed, or when
a fresh reconcile read proves whether it did. Every other leg ends as a failure
with the existing manual link.

## Evidence

Read against `main` at `01e42b3`, assuming plans 005 (#369) and 014 (#385)
have landed: `providerHasWatch` returns `null` for a provider it can't read
(Simkl), and `LogMediaVariables.retryOf` carries the original round's
`rewatch` decision into a retry.

- **Code**: `src/features/log-media/use-log-media.ts`, `fan-out.ts`,
  `reconcile.ts`, `log-confirm-sheet.tsx`, `session/state.tsx`,
  `simkl-write-lock.ts`, `anilist-write-queue.ts`, `src/state/queries/query-client.ts`,
  `persist.ts`, `persist-provider.tsx`, `src/state/session/*`, and
  `@tanstack/query-core` 5.104.2 in `node_modules`.
- **Probe**: a local `bun` script against the installed `query-core`, with no
  app code and no network. It covers pause, dehydrate, hydrate, and resume, and
  its results are under Today.
- **Not observed**: no browser or device run. Nothing was logged against a
  real account. Native behaviour below is derived from code.
- Provider API behaviour that no doc in this repo records is marked
  **unverified**.

## Today

`useLogMedia` sets no `networkMode`, `retry`, or `mutationKey`, so the log
mutation runs with TanStack's defaults: `networkMode: 'online'` and no retries.
Nothing wires `onlineManager` or `focusManager` (`grep` finds neither in
`src/`), and no network-state library is installed.

**Web, offline before Confirm.** `QueryClient.mount()` subscribes
`onlineManager` to the window's `online`/`offline` events. While offline,
`retryer.canStart()` is false, so the mutation dispatches `pending` with
`isPaused: true` and `mutationFn` never runs (probe: `status pending isPaused
true ran 0`). The Confirm button stays on "Logging…" (`loading={pending}`),
`trackBusy` holds the item busy, and the sheet waits. When the window goes back
online, `resumePausedMutations` runs it as a normal log, with the reconcile
reads taken at that later moment.

**Native, offline before Confirm.** React Native has no
`window.addEventListener`, which TanStack's own `onlineManager` notes, so the
app always counts as online and the mutation runs:

1. `enrichExternalIds` and the plan 0027 translation degrade uncached lookups
   to misses (`mappingMiss`, `.catch(() => null)`). Targets can narrow, or
   Trakt and Serializd become mapping skips.
2. Reconcile reads that aren't fresh in the cache fail, and `providerHasWatch`
   treats a failure as "doesn't have it". The decision is a blind catch-up, so
   `rewatch` is `false`.
3. Every adapter rejects with a `ProviderNetworkError` that has no status, and
   `runProviderWrites` turns each rejection into `{ status: 'error' }`.
4. The sheet shows the per-provider report with "Try again" and the
   `OutcomeLink` for each provider. If the sheet was already closed, a "Not
   logged on …" toast appears instead.

The log exists only in the sheet's `useState`. Dismissing the sheet or killing
the app loses it.

**Connection lost mid-flight.** On both platforms, legs whose request was sent
can fail with no response. This is the uncertain case that plan 014 handles
for the manual retry: a write may have landed even though it reported an error.
`simkl-write-lock.ts` already refuses to replay these: "Anything else may have
landed or never will, so it isn't replayed."

**Restart.** Nothing survives, except a web-only accident. `persistOptions`
sets only `shouldDehydrateQuery`, and `dehydrate` falls back to
`defaultShouldDehydrateMutation`, which keeps paused mutations. Any snapshot
flush while a web log is paused therefore writes it to disk. On the next load
it hydrates as a pending, paused mutation with no `mutationFn`, because
`useLogMedia` registers no `setMutationDefaults`. The next focus or online
event resumes it and it fails with `No mutationFn found` (probe: `after resume
error No mutationFn found`). No observer sees the failure, so the log is still
lost, just silently. See Follow-ups.

## Smallest restart-safe unit

Two candidates were compared: TanStack paused-mutation persistence
(`setMutationDefaults` + `shouldDehydrateMutation` + `resumePausedMutations`)
and a custom pending-log record. The installed 5.104.2 supports the TanStack
path. `MutationCache.build` applies `defaultMutationOptions`, so a hydrated
keyed mutation picks up its registered `mutationFn`. `mutationFnContext.client`
also supplies the `QueryClient`, so that half of the closure problem goes away.

| Concern | Dehydrated mutation | Pending-log record |
| --- | --- | --- |
| Survives an upgrade | No. It lives in the `query-cache` snapshot, which `BUSTER` bumps and the 24 h `maxAge` discard by design ("safe to nuke at any time"). | Yes. It has its own MMKV file with its own versioning. |
| Restart window | 24 h (`MAX_AGE_MS`). | Chosen freely (7 days below). |
| Flushed before a kill | Only when a persisted *query* changes. `PersistQueryClientProvider` subscribes to the query cache only. | Written synchronously at enqueue. |
| Native offline | Never pauses, because `onlineManager` is always online. Needs a connectivity dependency before anything persists. | Covers both offline-known and failed-in-flight cases. |
| Hook inputs | `connected` must be read at replay time, as it should be anyway. | Same. The replay calls the hook. |
| Account, duplicate, and outcome state | None. A resumed mutation has no observer, no identity check, and no per-leg state. | First-class fields. |
| Diary "pending" badge | Requires scanning the mutation cache. | Reads one MMKV key. |

**Recommended: the pending-log record.** The TanStack path saves a few dozen
lines, but its storage is the one file the app deliberately throws away. It
also can't tell an unsent leg from an uncertain one, and that difference is the
whole duplicate story.

## The record

One MMKV file, `pending-logs`, separate from `session` (tokens, todos/003)
and `query-cache` (disposable). On web it falls back to `localStorage` and,
like `persist.ts`, never runs during SSR. It stores no tokens.

```ts
interface PendingLog {
  id: string;                 // random, also the replay's busy key
  version: 1;
  createdAt: number;          // epoch ms
  /** The caller's input, minus derived fields. Re-planned on replay. */
  variables: Omit<LogMediaVariables, 'rewatch' | 'retryOf'> & { watchedAt: string };
  legs: Partial<Record<ProviderId, PendingLeg>>;
  /** The decision of the round that sent writes; absent while every leg is unsent. */
  retryOf?: { rewatch: boolean };
}

interface PendingLeg {
  /** unsent: no request left the device. uncertain: one may have landed. */
  state: 'unsent' | 'uncertain';
  /** Who the leg was meant for, when known at enqueue (see Account protection). */
  account: string | null;
}
```

- **Store the intent, not the plan.** An offline plan is built from failed
  lookups and blind reconcile reads (see Today), so replay re-runs
  `planLogWrite` online. `variables.providers` limits replay to the legs
  still pending.
- **Pin `watchedAt`.** Leaving it out means "now" to every adapter
  (`LogMediaVariables.watchedAt`, and Letterboxd's diary date "Omitted =
  today"). A replay two days later would date the watch wrong, so enqueue sets
  `watchedAt = new Date(createdAt).toISOString()` when the user left it unset.
- `variables.item` is the caller's `NormalizedMediaItem`. It's a plain JSON
  shape with no `Set` or `Map`
  (`docs/solutions/persisted-query-cache-set-and-map-corruption.md`). Keep
  it that way, or reuse `persist.ts`'s tagged codec.

## Lifecycle

All bookkeeping lives inside `useLogMedia`'s `mutationFn`. Every caller (the
confirm sheet and the catch-up/quick-log sheet) gets durability without a
change at the call site, and replay runs through the same reconcile
(maintenance note in plan 030).

1. **Detect offline before planning.** If `onlineManager.isOnline()` is false,
   skip the plan. Write a record with every routed provider `unsent`, and
   resolve with a `queued` outcome per target. The mutation needs
   `networkMode: 'always'` for this. Otherwise TanStack pauses it before
   `mutationFn` runs, which is today's endless "Logging…" on web.
2. **Write ahead.** Before `fanOutLog`, write (or update) the record with each
   write target `uncertain` and `retryOf: { rewatch: plan.rewatch }`. A kill
   mid-flight then leaves an honest record.
3. **Settle.** After the fan-out, drop every leg whose outcome is `ok` or
   `skipped`, and every `error` with an HTTP status. The server answered, so
   the existing report, retry button, and manual link own those legs, as they
   do today. Legs that failed with a status-less `ProviderNetworkError` stay
   `uncertain`. Delete the record when no leg remains. The fan-out's error
   outcome needs to carry that class (for example `network: true`). It's one
   optional field on `ProviderWriteOutcome`'s error arm.
4. **Native offline detection** is the gap that decides how often step 1
   applies. Without it, every native offline log reaches step 3 as
   `uncertain`, and Duplicate protection then replays less. See Open question 1.

## Account protection

The leg's `account` is filled at enqueue from what is known locally:

- Letterboxd and Serializd: `session.username` (`getLetterboxdUsername`,
  `getSerializdUsername`), which is always present.
- AniList: the `viewer` query (`anilistQueryKeys.viewer()`), which is
  forever-cached and persisted, so it's usually present.
- Trakt and Simkl: `traktQueryKeys.viewer()` and
  `simklQueryKeys.userSettings()`. Both are forever-cached but not persisted,
  and only Manage Trackers reads them, so after a cold start they are often
  `null`.

At replay, before a leg is sent:

- **Provider no longer connected:** the leg ends as `skipped` with reason "not
  connected" and its `providerItemUrl` link.
- **Connected but `!providerIsUsable`:** this is Trakt without credentials. The
  leg stays pending, matching AGENTS.md's "never cleared silently".
- **Identity:** read it fresh, once per drain per provider, with
  `staleTime: 0` on the same keys. The forever-cached value can name the old
  account after a reconnect (plan 013 documents this for AniList's `viewer`).
  A mismatch drops the leg with reason "connected as @new, logged as @old"
  and the link. An unknown enqueue identity holds the leg for one confirmation
  in the Pending list ("Log to Trakt as @bob?") instead of replaying it.
  Each identity read costs one request. AniList's costs one of its 30 per
  minute. Simkl's `/users/settings` is POST-shaped, so it counts against the
  1 POST/s limit, but it isn't a `/sync/*` write and doesn't touch the write
  lock.

## Duplicate protection

Replay calls `useLogMedia().mutateAsync` with the record's `variables`,
`providers` set to the pending legs, and the two replay-only inputs below.
`planLogWrite` then re-runs enrichment, routing, and reconcile.

- **Unsent legs** replay with `retryOf: { rewatch: false }`. No first-round
  reconciliation completed offline, so the app cannot infer rewatch intent.
  A provider that gained the watch meanwhile is skipped; parity never creates
  an unattended rewatch. An intentional rewatch queued before planning needs
  a fresh interactive confirmation, outside automatic replay.
- **Uncertain legs** replay with the record's `retryOf` (plan 014). A provider
  that now has the watch is skipped as "already logged" and never upgraded to a
  rewatch.
- **Strict reads in replay.** Interactively, a failed reconcile read means
  "doesn't have it", which is right when the user is watching the sheet. An
  unattended replay can't take that risk. If a reconcile read throws, the
  record stays pending until the next drain and no write is sent. In practice
  `providerHasWatch` rethrows instead of returning `false` when a
  `strictReconcile` variable is set. Strict replay also forces fresh provider
  watch-state reads, bypassing cached absence with `staleTime: 0`; the pre-write
  cache must never decide whether an uncertain write landed. Plan 014's current
  retry implementation does not yet do this and must be repaired first.

| Leg | A read that proves absence (Trakt, AniList, Serializd TV) | No such read (Simkl, Letterboxd) |
| --- | --- | --- |
| unsent | Replay with `retryOf: { rewatch: false }`; skip an existing watch. | Replay as non-rewatch. Nothing was sent. |
| uncertain, `rewatch: false` | Replay with `retryOf`. Skips if it landed. | Don't replay. Show failed, with the link. |
| uncertain, `rewatch: true` | Don't replay. Show failed, with the link. | Don't replay. Show failed, with the link. |

Simkl answers `null` after 005. Letterboxd's watch read is "positive evidence
or null-for-unknown, never 'unwatched'" (`persist.ts`), so a miss there
doesn't prove a diary entry is absent either. The two "don't replay" rows
exist because nothing can prove the write didn't land. Plan 014 keeps a retried rewatch a rewatch because the user presses
retry on purpose. An unattended replay doesn't have that consent, so it falls
back to the manual link, as `simkl-write-lock.ts` already does for uncertain
Simkl writes. Whether Simkl's `/sync/history` add is idempotent (re-adding an
episode that is already watched) is **unverified**. If a live probe shows it
is, Simkl's uncertain non-rewatch row can become "replay".

AniList's non-rewatch write sets one progress counter, so re-sending the same
progress is harmless (`anilist-write-queue.ts`: "writing 3, then 4, … then
10 leaves exactly what writing 10 alone leaves"). Its reconcile row is still
the safe path, because a rewatch increments `repeat`.

## Outcomes

`ProviderWriteOutcome` gains `{ provider, status: 'queued' }`. It isn't a
success or a failure, so `isCleanWriteReport` must not count it as either.

- **At Confirm.** If every target is `queued`, close the sheet with "Saved
  offline. Shinobu will log it on Trakt and AniList when you're back online."
  A mixed report shows the queued providers on their own line. Each queued row
  still has its `OutcomeLink` (neutral tone), so the user can log manually now.
  That keeps "never a dead end".
- **Pending list.** Add a "Pending" section at the top of the Diary tab. It
  reads the MMKV store synchronously, so it renders offline and on web, where
  the diary feed isn't persisted. Each record shows its title, episode, saved
  time, and per-provider state: waiting, needs confirmation (identity), or
  failed with its `OutcomeLink`. Swipe to discard. A pending record is the
  undo story for a log that hasn't landed: deleting it is the whole undo.
- **After a replay.** A clean record shows a success toast built from
  `logToastCopy`, prefixed "Logged from offline:". Anything else shows "Not
  logged on …" (the existing copy) and stays in Pending, with links, until the
  user discards it. A drain that replays several records shows one summary
  toast, not one per record.
- `invalidateAfterLog` runs inside the shared path, so Up Next, the watchlist,
  and the diary refresh exactly as they do for an interactive log. Queued logs
  don't advance Up Next optimistically (Open question 4).

## Ordering and limits

- **Triggers.** Drain the queue after session and cache restore at launch, on
  `onlineManager` going online, and on `AppState` returning to `active`. All of
  these are subscriptions in one root-mounted `PendingLogReplayer`
  (`useEffect` subscribes and cleans up). No timers poll.
- **Sequential, oldest first, one record at a time.** Order matters for
  AniList's single counter. Replaying E5 before E3 makes E3's reconcile see
  progress 5 ≥ 3 and skip E3 instead of replaying the original order. Within a record the
  fan-out stays parallel, as it is today.
- **Simkl.** Writes go through `simklLogQueue`. The drain awaits each record,
  so separate records do not coalesce: each can spend its own ~20 s lock.
  Only writes admitted together within one record can share a batch
  (`docs/solutions/simkl-rate-limits-and-write-lock.md`). The queue's own
  transient retries (`MAX_ATTEMPTS = 5`) still apply. No replay-level retry is
  added on top.
- **AniList.** A replayed log costs about three requests: the `entryState`
  read, `getEntryState`, and `SaveMediaListEntry`. Records replay
  sequentially, so `anilistWriteQueue`'s settle window spaces them. Stop the
  drain on the first `ProviderRateLimitError` or status-less network error and
  wait for the next trigger. That keeps the replay out of the retry storm in
  `docs/solutions/anilist-rate-limit-retry-storm.md`.
- **Caps.** At most 10 records per drain and 50 stored. A new log past the cap
  is refused with the manual links, not silently dropped. A record older than
  7 days stops replaying and stays in Pending as failed, with links. A
  week-old intent written silently is more surprising than helpful.
- **Busy guard.** The replay calls `trackBusy(item.id, …)`, so the item's
  log buttons hold while its record replays, just as for an interactive log.
- **Logged again manually.** When the user confirms a log whose item and
  episode set match a pending record, the new log supersedes the record. It
  inherits the record's `retryOf` when any leg was uncertain, so a landed
  offline write isn't re-sent as a rewatch, and the record is deleted. Other
  episodes of the same item don't conflict and replay in order.
- **Web tabs share `localStorage`.** Two tabs would both drain the same
  record. Replay on web only inside `navigator.locks.request('pending-logs',
  …)` and skip the drain where the Web Locks API is missing (availability
  **unverified** for the supported browsers).
- **Letterboxd.** On web, Letterboxd is `unsupportedWritePlatforms` or
  userscript-only, and plan 0042 rules out any automatic retry, so it's never
  queued. It stays the manual link. On native, the write needs the WebView
  bridge (`getLetterboxdWebFetch()` is `undefined` until the host registers).
  The drain waits for it rather than failing the leg as a dead session. Whether
  the bridge registers early enough at cold launch is **unverified**.

## Build outline

One feature PR, after 005 and 014:

- `src/features/log-media/pending-logs.ts`: the MMKV store and the pure
  transitions (enqueue, mark uncertain, settle, supersede, expire).
- `use-log-media.ts`: `networkMode: 'always'`, the lifecycle above,
  `strictReconcile`, and pending-record supersede at plan time.
- `fan-out.ts`: the `queued` outcome and the `network` flag on errors.
- A root `PendingLogReplayer`, plus the Diary "Pending" section.
- `persist.ts`: `dehydrateOptions.shouldDehydrateMutation: () => false`, so
  no paused mutation enters the query snapshot (see Follow-ups).
- Tests extend `use-log-media.test.ts` (strict reconcile, unsent vs uncertain
  replay with `retryOf`), plus a `pending-logs.test.ts` for the transitions,
  sized like `simkl-write-lock.test.ts`.

Native rebuild only if Open question 1 adds a dependency. Everything else hot
reloads.

## Open questions

1. **How does native learn it's offline?** Recommended: wire `onlineManager`
   to a native connectivity signal. That makes step 1 (unsent) the common
   native path. Unsent legs replay as non-rewatches, including Simkl;
   deliberate rewatches require interactive confirmation. AGENTS.md prefers a Nitro module. The candidates are `expo-network`
   and `@react-native-community/netinfo`, and whether a Nitro alternative exists
   is **unverified**. Any of them needs `bun ios:clean` / `bun android:clean`.
   Without a dependency, the fallback treats "every reconcile read failed with
   a status-less network error and none came from cache" as offline before any
   write is sent. It's weaker but free.
2. **Ask or drop on an unknown identity?** Recommended: ask once in Pending.
   Separately, persist the connected account (Trakt/Simkl username, AniList
   viewer id) into `ProviderSession` at connect time, as Letterboxd and
   Serializd already do. Identity is then always known offline and the ask
   path almost never runs. It overlaps plan 013, so do it there.
3. **Max age?** Recommended: 7 days, then failed with links in Pending,
   never silently dropped.
4. **Should a queued log advance Up Next or tick the episode?**
   Recommended: no. Provider state stays the source of truth, and the Pending
   section plus the "Saved offline" toast carry the intent. Revisit only if
   catch-up sessions on a plane feel broken.
5. **Queue for other write verbs (watchlist, lists)?** Recommended: not in
   this feature. Logging is the one with offline demand, and the Simkl
   watchlist remove deletes history
   (`docs/solutions/simkl-watchlist-remove-deletes-history.md`). That's not a
   write to replay unattended.
6. **Encrypt `pending-logs` at rest?** Recommended: no. It holds titles, ids,
   tags, and usernames, never tokens, so it sits outside todos/003.

## Follow-ups

- Web already writes paused log mutations into the query snapshot. They come
  back as `No mutationFn found` zombies (Today, Restart). Setting
  `shouldDehydrateMutation: () => false` in `persistOptions` is a one-line fix
  that stands on its own, with or without this feature.
- On native with no connectivity signal, `refetchOnReconnect` and
  `resumePausedMutations` never fire for queries either. Up Next only catches
  up on remount or pull-to-refresh after a connection returns. This is worth
  measuring alongside the "Verify actual offline-read coverage" half of #208.
