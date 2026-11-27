# Performance rules

These rules come from this app's `perf` PRs, `plans/031-performance-review-2026-11.md` and the Effect guide (`node_modules/effect/AGENTS.md`). Each rule names its source. Longer write-ups are in `docs/solutions/`.

## Measure first

- Find out if the wait is network or CPU before you pick a fix. Up Next waited on 6 requests in series while the JS thread was idle. (#37)
- Profile a release build on a real Android phone. Use Perfetto for JS thread load. Use the React profiler for commits. (#423, #433)
- A smaller mounted tree is not a speedup. Do not merge a speed claim without a repeatable timing. (#186, closed)
- If you have no device, count the work in a test. Count requests, snapshots, cache visits or renders. (#302, #310)
- A dev build runs about 3 times slower than a release build. Compare ratios, not milliseconds. (plan 031)
- Time a pure function in the app's Hermes runtime with `debugger-evaluate`, not in bun. One matcher took 0.5 ms in bun (JSC) and 3 to 6 ms on Hermes. (plan 031)
- Profile Firefox with the Gecko profiler's `nomarkerstacks` feature. Without it, the profiler captures a stack for each DOM style write, and a 1 µs write looks like the main cost. (#485)

## Cold start

- Persist the Home critical path to MMKV through an allowlist (`PERSISTED_PREFIXES` in `state/queries/persist.ts`). Do not persist the whole cache. (#37)
- On native, hydrate the cache synchronously before the first render. Suspense queries ignore `isRestoring` and go to the network. On web, hydrate asynchronously, so the first render matches the prerendered HTML. (#296)
- A persisted query needs a `gcTime` at least as long as the persister `maxAge`. The snapshot does not include a query that the cache garbage-collected. `retainPersistedQueries` sets this `gcTime` for each allowlisted prefix. A `gcTime` on the query itself overrides it. (#37)
- `JSON.stringify(new Set())` gives `{}`. Tag `Set` and `Map` in the codec before you persist a key. (#37)
- Persist only the first page of an infinite query. A restored query refetches every page it holds. (#298)
- Keep large payloads off the web allowlist. `localStorage` holds only a few MB. (#37, #298)
- Do not persist a streamed aggregate before it is complete. (#328)
- Do not mount hidden tabs and closed sheets until the splash screen closes. Use `DeferredTab` and `useBootRevealed`. (#346)
- Keep inline requires on in `metro.config.js`. With them, Home evaluates 19 % fewer modules. (#299)
- Mount a hidden WebView on first use, not at launch. (#299)
- Replay allowlisted launch reads through Nitro Fetch before JS starts. Stop the replay after a mutation or a credential change. (#346)
- Make sure that a warmup sends its request. One warmup never reached the transport because its prefetch key was missing. (#310)
- Prefetch Up Next when the app comes to the foreground. Because of `staleTime`, a quick app switch sends no request. (#37)
- Serve WOFF2 font subsets and preload them in the static HTML. Web fonts went from 1.51 MB to 349 KB. (#358)

## Cache snapshot writes

- Write the snapshot only when an allowlisted query changes. (#276)
- Ignore fetch-start events. They doubled the snapshots during a refetch. (#302)
- Debounce the write. Wait for 2 s of quiet, and never more than 10 s (`QUIET_MS` and `MAX_WAIT_MS` in `persist-provider.tsx`). One write costs about 40 ms on a Pixel 8 Pro. (#310, #423)

## Requests

- When two consumers read the same data, give them one query key. (#298, #301, #328, #329)
- Keep ids that only feed a fallback out of the query key. If such an id arrives late, the query refetches and the screen suspends again. (#296, #330)
- Set `gcTime` equal to `staleTime` on detail reads. With the 5-minute default, the skeleton comes back. Do not do this on an infinite query, because a stale cached one refetches every page it holds. Do not do this under a persisted prefix, because the query's `gcTime` overrides `retainPersistedQueries`. (#296, #298, #478)
- Ask for more in one request. TMDB `append_to_response` loads the show and 20 seasons in one call. (#298)
- When page 1 gives the page count, load the other pages in parallel. (#298)
- To get a redirect URL, read the `Location` header. Do not download the page. (#337)
- Raise a concurrency limit only when a measurement supports it. Letterboxd reads went from 4 to 8 permits. Up to 12 permits, latency stayed flat and no 429 came back. (#423)
- Do not download a page a second time for one more field. (#423)
- Mount a per-item query only on the items that need it. (#296)
- When `onEndReached` fires again, reuse the pending page. (#329)
- Show each provider's result when it arrives. During a refetch, keep the complete cached result. (#328)
- Render the item that is ready before its full catalog loads. (#347)
- Do not make a detail read wait for Home to load. (#187)
- Offline, pause a read. Do not retry it. Native reports connectivity through `lib/online`, so a read with no network sends 0 attempts, not 4, and resumes on reconnect. Not measured on a device. (#497)

## Invalidation

- Never call `invalidateQueries()` without a filter. Native mounts every tab, so every query refetches. (#371)
- After a log, invalidate the logged item with a predicate, not the root key. A root invalidation downloaded 100 film pages again for one film. (#373)
- Invalidate by media type. An episode cannot change the watched-movies library. (#383)
- Limit pull-to-refresh to the current item's queries. (#330)
- Write the confirmed result into the cache, so the tick shows before the refetch. (#296)
- Draw a confirmed log before the provider answers. A mutation of its own in `CatchUpLogProvider` holds it until the log's refetches land (`LogMediaResult.settled`), and a failed write ends it. Do not hold it in an async transition: React 19 joins them, so one log ends only when every log does. Show only an episode the data proves. (#497, #515)
- Cancel reads that started before a write. If you do not, they put old data back. (#329)

## Prefetch

- Prefetch data on press with `usePrefetchMediaDetails()`. The fetch then runs during the push animation. (#296, #298, #330)
- While a sheet is open, warm the reads it needs. (#296)
- Do not render a hidden screen on press-in. Press-in also fires when a scroll starts. Each fling blocked JS for about 200 ms. (#300 added it, #433 removed it.)

## Lists

- Virtualize rails with `components/List`. Mounted credit cards went from 35 to 14. (#184, #187)
- On a virtualized list, scroll jank comes from the cost to mount rows. `recycleItems` is off by default. Turn it on only for a list that measurably needs it. When it is on, derive cell state from props. (#37, #427)
- When recycling is on, key cells by column. Set `getItemType` when cells differ in kind. Give images a `recyclingKey`. (#427)
- Tune `drawDistance` for each list. Grid view uses 8 rows on the active page and 2 rows on neighbor pages. Details uses 50 px to match the first pool of Legend List. (#411, #427)
- Keep state that changes during a scroll out of the cells. Examples are the pinned shelf, the sticky date and the scroll-to-top button. The diary keeps this state in `DiaryList`, which owns the list. `DiaryList` also keeps the list's props memoized. (#276, #411, #427)
- Pass a cell its `item` and stable callbacks. Do not pass a wrapper object that each render builds again. (#423)
- Keep cell props out of JSX that depends on `pages`. TanStack returns `pages` as a new tracked result on every render. React Compiler then builds JSX that depends on `pages` again each time. (#423)
- Compute `useQueries` results in `combine`, so values that did not change keep their identity. (#423)
- Keep heavy matching out of `combine`. It runs again each time a read settles. (#433)
- Read the watched libraries once per list and pass the result to each row. Do not subscribe every row to every library. (#287)
- Search collections in order. Do not flatten them all to find one item. (#302)

## Render cost

- React Compiler can skip a component and give no warning. `shinobu/react-compiler-bailout` makes lint fail when this happens. (#411)
- Create `Intl` formatters once. Hermes builds a new one on each `toLocaleDateString` call. (#296)
- On web, render buttons with react-native-web's `Pressable`, not a gesture handler. Each pressto button ran a gesture handler and three Reanimated mappers in JS. App JS on sheet and tab flows went down by 20 % in Firefox. (#485)

## Data layout

These rules are for CPU work in a loop over many rows. First prove that the loop is hot. Most waits in this app are network waits.

- In a hot loop, speed comes from CPU cache locality: data that sits together and is read in order. An array of objects, a `Map` and a `Set` follow pointers across the heap. A typed array of numbers is one contiguous block. (#423)
- A cache over compute hides a slow design. Make the derivation run once per data change, then delete the cache. Keep a cache only for network latency or platform cost. Plan 031 gives a verdict on each cache that the app had on 2026-11-02. (plan 031)
- If work does not depend on the item, do it once in the producer, not once per lookup. Hermes runs Unicode `normalize` and regex work slowly. (plan 031, follow-up A, #433)
- In a hot loop, replace a `Map` or `Set` lookup with a sorted flat array and a binary search. A scan cost 38 ms per pass on a phone. In bun, `indexLibrary` (`lib/media-progress.ts`) lookups went from 1.45 ms to 0.022 ms per pass. (#423)
- Refer to a row by its index in the array, not by its object. Keep the indexes in an `Int32Array`. (#423)
- When the loop reads one or two fields, use a structure of arrays, with one column per field. `LibraryIndex.columns` is one. Its `rows` are an `Int32Array`, and its `values` are a plain array. (#423)
- Use a bitmask, not an array of booleans or a `Set` of a small enum. One number holds 32 flags. A `Uint32Array` holds more. The app has no bitmask yet. Plan 031 follow-up B proposes one. A Hermes timing must justify it first. (plan 031)

## Effect

The vendored `effect-ts` skill covers only setup. These rules come from the Effect guide and the PRs.

- Import by subpath (`effect/Effect`). The barrel evaluates all of Effect at launch. Lint enforces this. (#346)
- Use `Effect.fnUntraced` for a function that runs once per row. On each call, `Effect.fn("name")` adds a tracing span and captures a stack frame. Keep the name on top-level reads, where the stack trace helps. (Effect guide)
- Limit a fan-out with `concurrency` or a shared `Semaphore`. Take the limit from a measurement. (#298, #423)
- If an API takes several ids in one call, batch single lookups with `RequestResolver`. The app does not use it yet. (Effect guide)

## Animation

- Stop animation loops that are offscreen, for example with `<Skeleton animated={false}>`. Neighbor pages ran up to 48 skeleton pulses that nobody could see. (#239)
- Animate `scaleY`, not height. A height animation runs layout on every frame. (#239)
- Track scroll on the UI thread with the list's Reanimated offset. JS handler calls went from 58 to 0. (#301)
- In an accordion, keep the header height stable. Animate only the first rows of the section that opens. (#287)
- Play an entrance animation once. Clear its marker on scroll and on remount. (#287, #328)
- Do not animate row positions on web. (#239)
- Animate a keyboard-driven position with a transform, not `bottom` or padding. With `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`, Reanimated applies a transform without a shadow-tree commit. The sheet's keyboard lift went from 3 missed frames to 0.5 (median) on a Pixel 8 Pro release build. (PR TBD)

## Build

- Web export uses `--max-workers 2`, sized for a 2-vCPU runner. Locally, this took the export from 91.9 s to 63.0 s. Keep `--clear`. (#261)
