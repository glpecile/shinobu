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

**Cold poster pool.** Isolating the pin did not eliminate first-fling blanking.
A subsequent 70 ms fling from the loaded shelf view still produced 28
consecutive blank frames (0.93 s at 30 fps) in the central/lower list region.
React profiling attributed the largest batches (110–129 ms in dev) to poster
cells mounting or rebinding, not another render of the progress owner.

The selected grid now draws eight poster rows ahead instead of two, so full
poster rows are ready before the fling leaves the short shelves. Neighboring
seasons retain two rows: the pager mounts them too, and warming every page
at once creates unnecessary startup work. A four-row buffer
still blanked. Keeping headers mounted with Legend's `alwaysRender` reduced
cold conversions but did not eliminate blanking, and was unnecessary with
the eight-row buffer, so it was removed. List view keeps its four-row buffer.

Two independent cold-start recordings established the eight-row threshold.
With the selected-page-only buffer, the original iOS shelf fixture had zero
blank frames across 162 recorded frames; the first fling after selecting the
already-mounted neighboring season also had zero across 178 frames. A clean
local Android emulator run had zero across 545 frames. The check counts frames
with less than 1% dark pixels in x=5–95%, y=42–87%, and the recordings were also
inspected visually. Pagination can still expose individual poster placeholders
while newly fetched images load; that is distinct from the empty viewport. The
tradeoff is more offscreen poster cells mounted at startup; this is a bounded
buffer, not rendering the entire season. These are simulator development-build
observations, not production-device timing guarantees.
