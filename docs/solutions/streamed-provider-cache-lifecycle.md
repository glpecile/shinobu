# Streamed provider cache lifecycle

Up Next and the merged watchlist use TanStack's `streamedQuery` to publish
provider inputs as each leg settles. Refetches use `replace`, preserving the
previous complete result until every leg finishes.

`streamedQuery` writes chunks with `setQueryData`, independently of the query
promise. Its cancellation tracking activates when `streamFn` reads
`context.signal`. Without that read, disconnecting a provider removes the
aggregate cache but a late chunk recreates it with the disconnected account's
data. Both stream callbacks consume the signal before starting their gather.
The cancellation tests exercise real aggregate queries and remove them while
an AniList read is pending.

A cold stream becomes `success` after its first chunk while its `fetchStatus`
is still `fetching`. Persisting that partial result would restore it as idle
and fresh, leaving missing providers absent until the stale window expires.
`shouldPersistQuery` only persists these aggregates when idle. Ordinary queries
keep the existing persistence policy.

Letterboxd's infinite watchlist reads page one through the shared single-page
query. Invalidate the single-page dependency before the infinite query: an
active grid refetches immediately when invalidated and otherwise copies the
still-fresh old page into its new result.

Late card entrances record their IDs on the CSS animation's start event. The
rail owns that history, and each mounted wrapper captures its own eligibility.
Returning to a calendar day or remounting a virtualized card therefore does not
replay its arrival animation. No effect or timer tracks animation completion.
