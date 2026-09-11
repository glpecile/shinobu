# A catch-up chain burns the AniList budget writing one counter N times

**Symptom (2026-09-11).** Catching up ten episodes from the quick-log sheet
(plan 0037) ends with the last one or two episodes reporting
`anilist: rate limited — try again shortly`, while the earlier ones land. The
report view names them, a retry usually works, and nothing about the show or
the session is special.

## Cause (measured, not guessed)

AniList's budget is **30 req/min** (`docs/solutions/web-cors-anilist.md`), and
one `logToAniList` costs **two** requests: `getEntryState` and then
`SaveMediaListEntry`. Ten episodes is twenty, fired in a few seconds, on top of
the reconcile reads each confirm makes and the `entryState` refetch each
success invalidates.

They all say the same thing. **AniList stores progress as one counter per
entry** — writing 3, then 4, … then 10 leaves exactly what writing 10 alone
leaves; the intermediate values are overwritten, never recorded. Unlike Trakt,
Letterboxd and Serializd, which keep per-episode history, every write below the
highest was spent to store nothing.

`use-log-media.ts` already serialized AniList writes (one in flight at a time,
so a slow episode-4 write can't land after 5's and regress the counter). One at
a time is not fewer.

## Fix

`features/log-media/anilist-write-queue.ts` — the same shape as
`simkl-write-lock.ts`, for the same reason ("batch, never loop", across time).
Writes waiting on the same entry **collapse into one write carrying the highest
progress**, and every folded caller resolves with that write's result.

Folding only what arrives *mid-flight* barely folds anything: when the
round-trip is quicker than the user's thumb the queue is idle at every press.
So a landed write also holds the queue for a **900 ms settle window** that later
arrivals fold into. It doubles as request spacing, and costs the user nothing —
the counter's end state is identical and the sheet stays open until its writes
settle.

A `null` fold key opts out, for writes that are not a counter: a film's
`repeat` *increments*, so two rewatch logs are two facts.

## Measured

Six-episode chain on web, mocked AniList at 400 ms latency, counting real
requests: **15 (9 read + 6 save) → 8 (5 read + 3 save)**. The fold gets better
the faster the user confirms — which is the case that was failing.

## Rule

Before adding a retry, ask whether the request needed to exist. This app has
already paid for the other answer once
(`docs/solutions/anilist-rate-limit-retry-storm.md`): `anilist/http.ts` sleeps
on `Retry-After` once and no more, deliberately.

## Still open

`logToAniList` reads `getEntryState` through Effect while the log's reconcile
leg has just read the same entry through the query cache — a duplicated request
per write. Closing it means handing the adapter the cached state as a hint.
