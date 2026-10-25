# Diary pagination restarts and shared RSS reads

Repeated diary end-of-list events called `fetchNextPage()` with TanStack
Query's default `cancelRefetch: true`. With a loaded first page, a second
call cancelled and restarted the pending provider page. It could also
interrupt a refresh. `cancelRefetch: false` reuses the in-flight fetch.

The diary and film plays also fetched the same Letterboxd RSS window
independently. Both now use `fetchQuery` with a username-scoped key under
`letterboxd/diary`. Concurrent consumers share one request; provider
disconnect purges it. Pull-to-refresh and successful Letterboxd logging
invalidate this input before the unified diary refetch starts. The input
disables automatic retries to preserve the diary's settled-error behavior.
Cancel any pending RSS read first: invalidation alone reuses its pre-write
promise, whose old response would become fresh again for five minutes.

Keep the unified infinite query and its parallel provider fan-out. The
watermark cursor depends on prior pages, and publishing each provider
separately previously caused visible reshuffling. AniList's first Viewer
lookup is a real dependency and already cached indefinitely.

`use-diary-feed.test.ts` exercises the real hooks with deferred transports.
Both regressions produce two requests on the original implementation and one
after the fixes. It also covers refresh, successful-log invalidation, and
username separation, including a pre-write RSS response landing after a log.
The existing diary-state test freezes input arrays to
guard the linear accumulator against mutating cached pages.

A synthetic Bun run with 100 pages of 50 entries measured median fold time
over nine batches of 100 calls: 0.63 ms before and 0.13 ms after. Entry copies
fell from 252,500 to 5,000 appends, with identical output. This measures only
the page fold, not device latency or frame time. The iOS quick render scan
returned no profiler data. After recovering an Argent CoreDevice transport
failure with a scoped server restart, the iOS diary rendered its populated
calendar and grouped rows successfully. Device timing remains unmeasured.
