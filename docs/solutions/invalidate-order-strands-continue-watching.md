# A logged episode doesn't advance the Continue Watching card (Simkl/Serializd)

## Symptom

Quick-logging an episode from a Continue Watching card worked for **anime**
(AniList-sourced) but not for shows: the write succeeded, the toast fired, the
card's spinner ran out its settle window, and the card kept showing the episode
that had just been logged. A manual pull-to-refresh on Home fixed it every
time. Owner report, 2026-08-18.

## Cause

`invalidateAfterLog` (`features/log-media/use-log-media.ts`) invalidated
`upNextQueryKeys.inputs()` in the *middle* of the function — after the Trakt
and AniList branches, before the Simkl and Serializd ones.

That ordering is load-bearing, because `invalidateQueries` is not deferred.
TanStack Query invalidates and then refetches inside one synchronous
`notifyManager.batch`, and `query.fetch()` calls the `queryFn` synchronously —
so the Up Next `queryFn` (`fetchUpNextInputs`) starts running *inside* the
`invalidateQueries` call, and reaches its per-provider `queryClient.fetchQuery`
calls before the next statement of `invalidateAfterLog` executes.

Each of those inner reads is a plain `fetchQuery` with a `staleTime`
(`SIMKL_WATCHING_STALE_MS` is 15 minutes). Invalidation is the *only* thing
that makes them refetch during that window. So:

```
invalidateQueries(up-next/inputs)   // ← refetch starts HERE, synchronously
  → fetchUpNextInputs()
      → fetchQuery(simkl/all-items/all/watching)   // still fresh → cached data
invalidateQueries(simkl/all-items)  // ← too late; nothing observes this key,
invalidateQueries(simkl/activities) //   so no second refetch ever happens
```

The gather recomputed Continue Watching from the **pre-write** Simkl snapshot.
Trakt and AniList escaped only because their branches happened to sit above the
Up Next line — nothing about them was more correct.

Serializd is not an Up Next input source at all; it appeared in the report
because a TV show fans out to Serializd *and* Simkl, and Simkl is what sources
the card.

## Fix

Move the Up Next invalidation to the **last** statement of
`invalidateAfterLog`, after every per-provider branch:

```ts
if (succeeded.includes('simkl')) { /* simkl caches */ }
if (succeeded.includes('serializd')) { /* serializd caches */ }
// last: the gather reads every cache above, and reads them synchronously
if (touched('trakt') || touched('anilist') || touched('simkl')) {
  queryClient.invalidateQueries({ queryKey: upNextQueryKeys.inputs() });
}
```

Guarded by `invalidate-after-log.test.ts` → *"recomputes Up Next last, after
every provider cache it reads"*, which asserts `up-next/inputs` is the final
key invalidated.

## The general rule

**A query whose `queryFn` gathers other cache entries must be invalidated after
every entry it gathers.** The gather starts synchronously, so "invalidated in
the same function" is not the same as "invalidated in time" — only ordering
within that function decides what the gather sees. Any new provider branch
added to `invalidateAfterLog` goes above the Up Next line, not below it.
