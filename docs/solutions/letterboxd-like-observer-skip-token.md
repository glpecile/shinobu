# List likes overwrote the liked-list fetch function

The like control observed the shared infinite liked-list query through a
cache-only `useQuery` with `queryFn: skipToken`. Mounting it replaced that
query's cached fetch options. After a like or unlike, invalidation refetched
the active list index with `skipToken`, producing a configuration error instead
of refreshing membership.

The control now uses the same infinite-query options as the list index, with
`enabled: false`. It still observes cached membership without starting its own
request, but leaves a real fetch function available for active index observers.
The separate optimistic boolean cache retains `skipToken` because it has no
remote fetcher and is not part of the list-index invalidation.

The existing mutation regression in `src/state/queries/letterboxd.test.ts`
keeps an index observer active and verifies refetches after both a confirmed
like and a failed unlike, alongside shared optimistic state and rollback.
