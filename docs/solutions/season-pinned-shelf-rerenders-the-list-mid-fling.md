# A pinned head in the list owner re-renders the list mid-fling

**Symptom (2026-11-08, PR #427).** On the iOS simulator, a fast fling from the
top of Anime Seasons (Fall 2026, TV, grid, with a Watching, a watchlist and a
Seen title) left the grid blank for up to 1.5 s.

**Cause.** `onViewableItemsChanged` set the pinned shelf as the fling crossed
each shelf head. The state lived in `SeasonList`, so every crossing re-ran its
hooks: two `useQueries` over every title and `seasonRows`. That was a 141 ms
commit in dev. The new `rows` array also made Legend List re-render all its
containers. A probe on `onScroll` showed scroll events 270–350 ms apart while
the list moved 1,400 px.

**Fix.** `ShelfList` owns the pin state, below the progress reads. A pin change
now re-renders only it (1.5 ms).

**React Compiler trap.** The first version kept `heads` as a `Map` and read it
with `heads.get(pinned.shelf)`. The compiler assumes a method call can mutate
the `Map`, so it put the `Map`, the viewability handler and the pin into one
memo scope. Every pin change then created a new `onViewableItemsChanged`, and
Legend List re-rendered its scroll view (53 ms). Derive from `data` with
`find`/`some` so the handler depends only on the rows. To check a scope,
compile the file with `babel-plugin-react-compiler` and read the `$[n]` guards.

**Still open.** The first fling out of the shelves still mounts about six full
poster rows (266–433 ms blank in dev). Legend List reuses containers across
item types, so the head containers turn into poster rows. No prop disables
that.
