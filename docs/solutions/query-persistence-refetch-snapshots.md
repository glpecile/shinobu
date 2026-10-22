# Refetch-start events rebuild unchanged cache snapshots

The persistence subscriber filters to allowlisted query keys, but TanStack also
emits an `updated` event with action `fetch` when a request starts. Calling
`persistQueryClientSave` at that point dehydrates the entire cache before new
data arrives. The storage persister's throttle runs after dehydration, so it
does not prevent that traversal.

Skip only the `fetch` action. Keep completion, error, invalidation and removal
events so new data and discarded entries still reach storage. No new debounce,
cache format or persistence allowlist is needed.

In a synthetic host workload of 20 cached queries refetched concurrently, the
installed TanStack implementation built 40 snapshots and visited 800 query
entries before the guard, versus 20 snapshots and 400 visits after it. Both
final snapshots retained all refreshed data. This measures work reduction,
not release-device timing.

`persist.test.ts` mounts the real provider and checks that a pending refetch
does not save, its completion does, removal clears the snapshot and an
unpersisted query does not save. The fetch-start assertion fails before the fix.
The change is JavaScript-only and hot reloads.
