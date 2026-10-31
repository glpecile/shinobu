# Bound Letterboxd list progress reads

List progress needs every loaded film, even when its row is offscreen. The
per-film query fan previously started 100 public reads before any response
returned. Limiting the reads to visible rows would make the list's completion
count incomplete.

Film HTML, TMDB-to-slug redirects, and member viewing pages share an Effect
semaphore in `src/lib/providers/letterboxd/public-reads.ts`. Four permits are a
conservative application ceiling, not a measured upstream quota. Each permit
covers response-body consumption as well as the initial fetch. TMDB enrichment
runs outside the permit. Query keys, account isolation, and positive-only
watched evidence stay in the existing TanStack cache.

A nested `fetchQuery` alone does not inherit its parent's cancellation. A watch
query temporarily observes its shared slug query and unsubscribes on completion
or abort. TanStack cancels it only when no observers remain, so leaving a list
stops queued work without canceling a lookup another consumer still needs.

The query regression in `src/state/queries/letterboxd.test.ts` uses deferred
transport responses through the real query/provider chain. It verifies that
mixed identity and watch reads saturate at four, drain to completion, and stop
when their consumers unsubscribe. Live Letterboxd latency and quota calibration
remain unmeasured.
