# Query persistence adds work to list scrolling

TanStack's persistence subscription saves on every query-cache add, update,
or removal. `persistQueryClientSave` dehydrates the cache before passing the
snapshot to the storage persister. The storage throttle delays serialization
and writes, so it does not prevent that cache walk.

Timeline rows mount per-item queries while scrolling. Those queries are outside
the persistence allowlist, but the upstream subscription still dehydrates the
cache for their events. Keeping every query for 24 hours makes those walks grow
throughout a browsing session.

`state/queries/persist-provider.tsx` subscribes only to events for allowlisted
keys, using TanStack's restore and save functions. `retainPersistedQueries`
applies the snapshot's 24-hour retention only to those keys. Other queries keep
TanStack's normal eviction time. Disconnect still removes provider queries,
and those removals update the snapshot within the bounded save window.

The first eligible event starts a two-second timer. Further events do not reset
it; expiry dehydrates the live QueryClient once. Subscription cleanup cancels a
pending timer and flushes the current cache, including removals. The storage
persister uses `throttleTime: 0`, so it writes on the next timer tick without
another two-second delay. Fetch-start and unpersisted-query events remain ignored.
Restore behavior, codecs, max age, first-page limits and eviction rules are unchanged.

The batching regression in `persist.test.ts` uses fake timers and the real
`createQueryPersister` with fake native MMKV. It checks no snapshot at 1,999 ms,
one at 2,000 ms, the next-tick disk write, latest data and a late removal without
resetting the window. Unmount flushes pending removals without a duplicate save
two seconds later. In a synthetic burst of 20 persisted refetch completions with
one unpersisted query present, batching reduced snapshots and cache traversals
from 20 to one and entry visits from 420 to 21. This is 95% less work for that
workload, not a measured device, frame-time or latency gain.

The provider must consume restore failures before leaving restoring mode.
TanStack removes a corrupt snapshot and then rethrows; `finally` alone resumes
queries while leaving an unhandled rejection. The corrupt-snapshot regression
in `persist.test.ts` mounts the real provider and storage persister, then checks
that queries resume after discarding malformed JSON. It fails without the
rejection handler.
