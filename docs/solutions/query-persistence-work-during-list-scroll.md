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
and those removals update the snapshot.

The provider must consume restore failures before leaving restoring mode.
TanStack removes a corrupt snapshot and then rethrows; `finally` alone resumes
queries while leaving an unhandled rejection. The corrupt-snapshot regression
in `persist.test.ts` mounts the real provider and storage persister, then checks
that queries resume after discarding malformed JSON. It fails without the
rejection handler.
