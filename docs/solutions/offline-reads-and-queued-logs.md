# Offline: what reads, what waits, what fails

Issue #208. Plan: `docs/plans/0116-offline-log-replay.md`. Written from the
code and unit tests. No device or browser ran offline for this note, and no
provider write was sent.

## The connectivity signal

React Native has no `online` event, so TanStack Query counted native as always
online. `lib/online` now feeds it `expo-network`. Web already follows the
window's events.

- Only "no network" is offline (`isConnected === false`). A captive portal or
  a dead cellular link still counts as online, and requests fail there as they
  did before.
- Offline, a read pauses. It does not run its 4 attempts and fail. It resumes
  when the connection returns, and stale mounted reads refetch then.
- A paused read with nothing cached keeps its skeleton until the connection
  returns. It shows no error. Web always did this. Native used to show the
  error fallback after the retries.
- Every mutation runs with `networkMode: 'always'` (`query-client.ts`). A
  write never waits in memory for a connection. Offline, it fails with its
  per-provider links, and a log goes to the queue below.
- No mutation enters the persisted snapshot (`shouldDehydrateMutation` in
  `persist.ts`). `networkMode: 'always'` does not make this redundant: a
  mutation that waits in its `scope` is paused too, and a restored one has no
  `mutationFn`.

## Reads that work offline

A read works offline only when it is in the persisted snapshot
(`PERSISTED_PREFIXES` in `state/queries/persist.ts`) or still in memory.

| Surface                                                                   | Native                           | Web                                        |
| ------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| Home: Up Next, watchlist, Continue Reading, trending, seasonal, list rows | Restored before the first render | Restored after mount                       |
| Diary                                                                     | First page restored              | Not persisted: `localStorage` is too small |
| Trakt show progress, watched movies, Letterboxd per-film reads            | Restored                         | Restored                                   |
| Details, episodes, search, person, studio, list detail                    | Only if opened in this session   | Same                                       |

- The whole snapshot is dropped after 24 hours (`MAX_AGE_MS`) and on a
  `BUSTER` bump. An app opened offline after a day shows nothing.
- An infinite query restores its first page only.
- The snapshot is written 2 to 10 seconds after a change, so a kill right
  after a fetch can lose that fetch.
- This is a bounded snapshot. It is not a full offline library.

## Logs that wait

`features/log-media/pending-logs.ts` keeps logs that could not be sent, in its
own MMKV file. `useLogMedia` writes to it, and `PendingLogReplayer` sends it
again through `useLogMedia` at launch, on reconnect and on foreground. While a
leg still waits it also sends on a timer, after 1 minute and then doubling to 15. A log that got no answer on a device that reports a connection has no
other trigger.

A leg is one provider's part of one log.

| Leg         | Meaning                                                     | On replay                                                   |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `unsent`    | Confirmed offline. No request left the device.              | Sent, unless a fresh read shows the provider has the watch. |
| `uncertain` | A request got no answer, or a replay was killed mid-write.  | Sent only after a fresh read proves the watch is absent.    |
| `failed`    | Stopped. Shown in Diary > Pending with its reason and link. | Never, until the user presses Try again.                    |

Rules that are easy to break:

- **Letterboxd on web does not wait** (`canQueueLog`). It has no transport to
  replay through, so offline it fails with the manual link. Every other
  provider waits, Hardcover included.
- **An unanswered write is kept only where a read proves absence**
  (`logReadProvesAbsence`: Trakt, AniList, Serializd). On Simkl, Letterboxd
  and Hardcover it stays a failure with the link, as before. Hardcover's read
  shows a finished book but not a page, and a resend could add a second
  journal entry. A rewatch round is never kept:
  the provider records the watch either way.
- **Try again does not resend an unanswered write there either**
  (`retryOf.unanswered`). The retry reads first. If the read shows the watch,
  the leg is done. If not, it is refused with the link, in the Pending sheet
  and in the log sheet. A Letterboxd bridge timeout is such a write. A log
  made by hand over such a leg is refused the same way, and `useLogMedia`
  returns `unanswered` so the sheet's next Try again is refused too. A rewatch
  retry in the log sheet is the exception. It is sent again.
- **A replay is never a rewatch.** Nobody confirms it.
- **A replay reads strictly.** A provider whose watch-state read gets no
  answer is not written (`LogWritePlan.unread`). In that round a provider
  skipped for a missing mapping waits too, because its lookup may have failed
  the same way. Interactively, the same failure means "write".
- **One record at a time, oldest first.** AniList keeps one counter. A
  transient failure holds that provider's later legs until the next drain.
  The other providers are still sent.
- **A leg is bound to a session** (`providerSessionEpoch`). A token refresh
  keeps the epoch. An OAuth connect always changes it, also over a kept
  session, because Trakt, Simkl, AniList and Hardcover sessions name no
  account (`connectProviderSession`). Letterboxd and Serializd change it only
  under another username. So the leg fails and is never sent under another
  account. A connected provider that can't be used (Trakt without
  credentials) fails the leg too.
- **The same watch queued twice is one record.** A log made by hand takes over
  the queued legs of the same watch.
- **Delivery is at-least-once only where it can be checked.** Simkl has no
  reconcile read, so the queue dedupes before it sends and never resends an
  unanswered Simkl write. The same holds for a Hardcover page log.
- Web tabs share the queue. A drain runs inside `navigator.locks`, and does
  not run where the API is missing. A tab shows another tab's changes through
  the `storage` event.

Limits: 50 records, 7 days. Past either, the log fails with its links. Nothing
is dropped silently.

## A log shows at once

`features/log-media/optimistic.ts`. A confirmed episode log is drawn before
any provider read shows it: its Continue Watching card moves and its season
row ticks. This replaces plan 0019 KTD-6 ("nothing advances optimistically").

- Two sources feed it. A `logged-watch` mutation in `CatchUpLogProvider`
  holds a log while its write and its refetches run (`LogMediaResult.settled`),
  one mutation per log. It is not `useOptimistic`, because React 19 joins
  concurrent async transitions (`react-async-transitions-are-entangled.md`).
  The pending queue holds a log that waits offline.
- A failed write ends the optimistic state, so the card and the tick go back.
  A queued record whose legs all stopped is not drawn as watched.
- A card moves only to an episode the data proves: the catch-up chain's next
  episode, or the next number of an unseasoned entry (AniList, Simkl anime)
  while its backlog count lasts. Otherwise the card leaves the rail until the
  refetch. A seasoned entry can't count forward, because the next number may
  belong to another season.
- A queued record keeps the chain's next episode (`LogMediaVariables.next`),
  so a Trakt or Simkl TV card moves there while its log waits. The chain needs
  its evidence. Trakt show progress is in the snapshot. The Simkl library and
  the season layout are not, so after an offline launch a Simkl TV chain has
  one episode and its card leaves the rail.
- It is display state only. The log path still reconciles against provider
  reads, never against this.
- Films, books, the Diary feed and the watchlist are not drawn ahead.

Not built: queued watchlist, list, pause and drop writes.
