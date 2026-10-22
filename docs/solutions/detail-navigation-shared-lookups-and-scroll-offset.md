# Detail navigation shares identity reads and native scroll offsets

## Hidden-screen reuse

Expo Router 58's installed stack router matches a preloaded route by screen name
and optional `getId`, then replaces its params when promoting it. Shinobu does
not assign a `getId` to detail routes. A media card can preload its canonical
route and push the iOS link with `zoomPoster` without creating another screen.
Do not remove the poster parameter to repair a supposed reuse failure.

## Duplicate identity requests

A TMDB detail without Trakt credentials resolves identity through Simkl. Its
variant posters also look up the same TMDB id through Simkl. Separate identity
and public-lookup keys caused two identical `/search/id` calls.

Both now use the public Simkl query options directly. Do not nest a public
`fetchQuery` inside another identity query. When the final public observer
unmounts, TanStack can cancel the inner query even while the outer observer
still needs it. Converting that cancellation to a miss can cache null forever.
Shared observers on one key preserve the correct cancellation lifetime.
Imperative enrichment converts provider errors to its existing null fallback
outside the shared query, and rethrows cancellation. Public errors remain errors.
The HTTP-boundary regression measures two requests before the fix and one after;
a real QueryObserver regression covers a public observer leaving mid-request.

## Native title tracking

`DetailsList` used a JS callback every scroll frame to update its title offset.
The shared List now exposes Legend List's supported `sharedValues` prop and uses
its Reanimated implementation when supplied. `scrollOffset` reaches the existing
animated custom refresh scroller through its forwarded ref. Legend List still
has its own JS virtualization work; this removes the application's title writes,
not every JS scroll event.

Native keeps an application `onScroll` only while a season's entrance animation
needs clearing. That covers drag, accessibility and programmatic scrolling.
Web retains its existing handler because its virtualizer does not forward native
drag-start events reliably.

## Validation, 2026-10-21

- iPhone 17 Pro simulator, iOS 26.5, development build; controlled 500ms scrolls
  down and up on the same cached movie detail, saved in
  `.argent/flows/ios-detail-title-scroll.yaml`.
- Temporary callback instrumentation measured 58 JS title-handler invocations
  before and zero after. The instrumentation was removed. The final native
  shared offset moved about 303 points; the replay returned to the top.
- Final replay passed twice. React profile captured two commits below 16ms;
  the concurrent native trace reported no hangs or hotspots. These short runs
  do not establish release-device latency. Earlier runs included Fast Refresh
  and are not valid before/after timing comparisons.
- Combined profiler reporting could not join the runtime's logical debugger id
  with the simulator UDID. Both reports were inspected separately.
- AniList returned HTTP 403 with an API-disabled message. Its development error
  overlay was dismissed/filtered only in the QA runtime to inspect public movie
  details. AniList-dependent runtime coverage remains unavailable.
- Android's installed development app returned to its launcher on restart, so
  the new native scroll path still needs Android runtime coverage.

No dependency or native configuration changed. These changes hot reload.
