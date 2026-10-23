# Refetch-start events rebuild unchanged cache snapshots

The persistence subscriber filters to allowlisted query keys, but TanStack also
emits an `updated` event with action `fetch` when a request starts. Calling
`persistQueryClientSave` at that point dehydrates the entire cache before new
data arrives. The storage persister's throttle runs after dehydration, so it
does not prevent that traversal.

Skip only the `fetch` action. Keep completion, error, invalidation and removal
events so new data and discarded entries still reach storage. The guard itself
did not change the cache format or persistence allowlist.

In the original synthetic host workload of 20 cached queries refetched concurrently, the
installed TanStack implementation built 40 snapshots and visited 800 query
entries before the guard, versus 20 snapshots and 400 visits after it. Both
final snapshots retained all refreshed data. This measures work reduction,
not release-device timing.

The later batching change starts a bounded two-second window on the first
eligible event and dehydrates the live cache once at expiry. Later events do not
reset the timer. Cleanup cancels the timer and flushes pending changes, and the
storage persister's `throttleTime: 0` avoids a second two-second delay.

With 20 preseeded persisted queries and one unpersisted query, a separate
synthetic refetch-completion workload fell from 20 snapshots and traversals with
420 entry visits to one snapshot and traversal with 21 visits. This is 95% less
work in that workload, not a measured device, frame-time or latency gain.

`persist.test.ts` mounts the real provider and storage persister with fake native
MMKV and fake timers. Pending refetches and unpersisted queries do not schedule
saves. Completed refetches produce no snapshot at 1,999 ms and one at 2,000 ms,
with refreshed data on disk on the next timer tick. A late removal does not reset
the window; cleanup flushes all pending removals without a duplicate save later.
Corrupt-restore and codec tests remain. The 10 focused tests, scoped oxlint and
typecheck pass. Restore behavior, max age, first-page limits and garbage collection
are unchanged. The change is JavaScript-only and hot reloads.
