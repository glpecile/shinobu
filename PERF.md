# Performance tips

Lessons from the 29 `perf` PRs (#37 to #433), `plans/031-performance-review-2026-11.md` and the Effect guide. Each tip names its source. Longer write-ups are in `docs/solutions/`.

## Measure first

- Find out if the wait is network or CPU before you pick a fix. Up Next was 6 serialized round trips on an idle JS thread. (#37)
- Profile a release build on a real Android phone. Use Perfetto for JS thread load and the React profiler for commits. (#423, #433)
- A smaller mounted tree is not a speedup. Without a repeatable timing, do not merge. (#186, closed)
- Without a device, count the work in a test: requests, snapshots, cache visits, renders. (#302, #310)
- A dev build runs about 3 times slower than release. Compare ratios, not milliseconds. (plan 031)
- Time a pure function in the app's Hermes runtime with `debugger-evaluate`, not in bun. One matcher took 0.5 ms on JSC and 3 to 6 ms on Hermes. (plan 031)

## Cold start

- Persist the Home critical path to MMKV through an allowlist (`PERSISTED_PREFIXES` in `state/queries/persist.ts`), not the whole cache. (#37)
- On native, hydrate the cache synchronously before the first render. Suspense queries ignore `isRestoring` and go to the network. Web stays async to match the prerendered HTML. (#296)
- A persisted query needs a `gcTime` as long as the persister `maxAge`. A collected query is not in the snapshot. `retainPersistedQueries` sets it for every allowlisted prefix, unless the query sets its own `gcTime`. (#37)
- `JSON.stringify(new Set())` is `{}`. Tag `Set` and `Map` in the codec before you persist a key. (#37)
- Persist only the first page of an infinite query. A restored query refetches every page it holds. (#298)
- Keep large payloads off the web allowlist. `localStorage` has a few MB. (#37, #298)
- Do not persist a streamed aggregate before it is complete. (#328)
- Defer hidden tabs and closed sheets until the splash reveals: `DeferredTab` and `useBootRevealed`. (#346)
- Keep inline requires on in `metro.config.js`. Modules evaluated at Home fell 19 %. (#299)
- Mount a hidden WebView on first use, not at launch. (#299)
- Replay allowlisted launch reads through Nitro Fetch before JS starts. Stop the replay after a mutation or a credential change. (#346)
- Check that a warmup dispatches. One never reached the transport because its prefetch key was missing. (#310)
- Prefetch Up Next on foreground. `staleTime` makes a quick app switch free. (#37)
- Serve WOFF2 font subsets and preload them in the static HTML. Web fonts fell from 1.51 MB to 349 KB. (#358)

## Cache snapshot writes

- Save only when an allowlisted query changes. (#276)
- Ignore fetch-start events. They doubled the snapshots during a refetch. (#302)
- Debounce the write: 2 s of quiet, 10 s at most (`QUIET_MS`, `MAX_WAIT_MS` in `persist-provider.tsx`). One write costs about 40 ms on a Pixel 8 Pro. (#310, #423)

## Requests

- Give two consumers of the same read one query key. (#298, #301, #328, #329)
- Keep ids that only feed a fallback out of the query key. A late id refetches and suspends the screen again. (#296, #330)
- Set `gcTime` equal to `staleTime` on detail reads. The 5-minute default brings the skeleton back. Not on an infinite query: a stale cached one refetches every page it holds. (#296, #298, #478)
- Ask for more in one request: TMDB `append_to_response` loads the show and 20 seasons together. (#298)
- When page 1 gives the page count, load the other pages in parallel. (#298)
- Read the redirect `Location` header. Do not download the page to get its URL. (#337)
- Raise a concurrency limit only with numbers. Letterboxd reads went from 4 to 8 permits after latency stayed flat to 12 with no 429. (#423)
- Do not download a page a second time for one more field. (#423)
- Mount a per-item query only on the items that need it. (#296)
- Reuse the pending page when `onEndReached` fires again. (#329)
- Show each provider's result when it arrives. Keep the complete cached result during a refetch. (#328)
- Render the item that is ready before its full catalogue resolves. (#347)
- Do not gate a detail read on Home loading. (#187)

## Invalidation

- Never call `invalidateQueries()` without a filter. Native mounts every tab, so every query refetches. (#371)
- After a log, invalidate the logged item with a predicate, not the root key. A root invalidation re-downloaded 100 film pages for one film. (#373)
- Invalidate by media type. An episode cannot change the watched-movies library. (#383)
- Scope pull-to-refresh to the current item's queries. (#330)
- Write the confirmed result into the cache so the tick shows before the refetch. (#296)
- Cancel reads that started before a write, or they put old data back. (#329)

## Prefetch

- Prefetch data on press with `usePrefetchMediaDetails()`, so the fetch overlaps the push animation. (#296, #298, #330)
- Warm the reads a sheet needs while the sheet is open. (#296)
- Do not render a hidden screen on press-in. Press-in also fires when a scroll starts, and each fling blocked JS for about 200 ms. Added in #300, removed in #433.

## Lists

- Virtualize rails with `components/List`. Mounted credit cards fell from 35 to 14. (#184, #187)
- Scroll jank on a virtualized list is row mount cost. `recycleItems` is off by default. Turn it on for long lists and derive cell state from props. (#37, #427)
- With recycling, key cells by column, set `getItemType` for different cell kinds, and give images a `recyclingKey`. (#427)
- Tune `drawDistance` per list: in grid view, 8 rows on the active page and 2 on neighbor pages; 50 px on Details to match Legend List's first pool. (#411, #427)
- Keep state that changes during a scroll out of the cells: pinned shelf, sticky date, scroll-to-top button. The diary holds it in `DiaryList`, the list's owner, and keeps the list's props memoized. (#276, #411, #427)
- Pass a cell `item` and stable callbacks, not a wrapper object built on each render. (#423)
- Keep cell props out of JSX that depends on `pages`. TanStack's tracked result recomputes it on every render. (#423)
- Compute `useQueries` results in `combine` so unchanged values keep their identity. (#423)
- Keep heavy matching out of `combine`. It runs again on every settled read. (#433)
- Let rows read one list-wide snapshot. Do not subscribe every row to every library. (#287)
- Search collections in order. Do not flatten them all to find one item. (#302)

## Render cost

- React Compiler skips a component without a warning. `shinobu/react-compiler-bailout` fails lint on it. (#411)
- Create `Intl` formatters once. Hermes builds a new one on each `toLocaleDateString` call. (#296)

## Data layout

For CPU work in a loop over many rows. Prove the loop is hot first: most waits in this app are network.

- The speed comes from cache locality: data that sits together and is read in order. An array of objects, a `Map` and a `Set` follow pointers across the heap. A typed array of numbers is one contiguous block.
- A cache over compute hides a slow design. Make the derivation run once per data change, then delete the cache. Keep a cache only for network latency or platform cost. Plan 031 has the verdict on each cache that existed when it was written.
- Do item-independent work once in the producer, not once per lookup. Hermes runs Unicode `normalize` and regex work slowly. (plan 031, follow-up A, #433)
- Replace a `Map` or `Set` lookup in a hot loop with a sorted flat array and a binary search. A scan cost 38 ms per pass on the phone. `indexLibrary` (`lib/media-progress.ts`) lookups went from 1.45 ms to 0.022 ms per pass, timed in bun. (#423)
- Refer to a row by its index in the array, not by its object. Keep the indexes in an `Int32Array`. (#423)
- Use a structure of arrays when the loop reads one or two fields: one column per field. `LibraryIndex.columns` is one: its `rows` are an `Int32Array`, its `values` a plain array. (#423)
- Use a bitmask, not an array of booleans or a `Set` of a small enum. One number holds 32 flags, and a `Uint32Array` holds more. The app has none yet: plan 031 follow-up B proposes one, gated on a Hermes timing.
- JS has no stack allocation. The equivalent is to allocate nothing per row: reuse one buffer made outside the loop, and avoid spread, `map().filter()` chains and a new closure per row.

## Effect

The vendored `effect-ts` skill only covers setup. These tips come from `node_modules/effect/AGENTS.md` and the PRs.

- Import by subpath (`effect/Effect`). The barrel evaluates all of Effect at launch. Lint enforces it. (#346)
- Use `Effect.fnUntraced` for a function that runs once per row. `Effect.fn("name")` adds a tracing span and captures a stack frame on each call. Keep the name on top-level reads, where the stack trace helps. (Effect guide)
- Bound a fan with `concurrency` or a shared `Semaphore`, and take the number from a measurement. (#298, #423)
- Where an API takes several ids in one call, batch single lookups with `RequestResolver`. The app does not use it yet. (Effect guide)

## Animation

- Stop loops that are offscreen: `<Skeleton animated={false}>`. Neighbor pages ran up to 48 invisible skeleton pulses. (#239)
- Animate `scaleY`, not height. Height runs layout on every frame. (#239)
- Track scroll on the UI thread with the list's Reanimated offset. JS handler calls fell from 58 to 0. (#301)
- In an accordion, keep header height stable and animate only the first rows of the opened section. (#287)
- Play an entrance once. Clear the marker on scroll and on remount. (#287, #328)
- Do not animate row positions on web. (#239)

## Build

- Web export uses `--max-workers 2`, sized for a 2-vCPU runner: 91.9 s to 63.0 s locally. Keep `--clear`. (#261)
