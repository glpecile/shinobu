# Watchlist cache subscriptions must ignore unrelated query creation

After disconnecting a provider, `ProviderCard` mounts a username query while
the closed `CardActionsSheet` remains subscribed to the watchlist query cache.
TanStack Query emits a synchronous `added` event when that username query is
built during render. Forwarding every cache event to `useSyncExternalStore`
tries to update `CardActionsSheet` while `ProviderCard` is rendering, producing
React's cross-component setState warning.

`subscribeWatchlistInputs` listens only to `updated` and `removed` events for
the exact gathered watchlist inputs key. Query creation and observer changes
don't alter the cached inputs; the initial snapshot is read directly when the
subscription mounts. All three cache-only watchlist consumers use this guard.
Do not replace them with `useQuery` observers: the gather has one query function,
and a passive observer with `skipToken` can still refetch on invalidation.
