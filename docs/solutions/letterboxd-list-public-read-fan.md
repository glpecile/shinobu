# Bound Letterboxd list progress reads

List progress needs every loaded film, even when its row is offscreen. The
per-film query fan previously started 100 public reads before any response
returned. Limiting the reads to visible rows would make the list's completion
count incomplete.

Film HTML, TMDB-to-slug redirects, and member viewing pages share an Effect
semaphore in `src/lib/providers/letterboxd/public-reads.ts`. Each permit
covers response-body consumption as well as the initial fetch. TMDB enrichment
runs outside the permit. Query keys, account isolation, and positive-only
watched evidence stay in the existing TanStack cache.

A nested `fetchQuery` alone does not inherit its parent's cancellation. A watch
query temporarily observes its shared slug query and unsubscribes on completion
or abort. TanStack cancels it only when no observers remain, so leaving a list
stops queued work without canceling a lookup another consumer still needs.

The query regression in `src/state/queries/letterboxd.test.ts` uses deferred
transport responses through the real query/provider chain. It verifies that
mixed identity and watch reads saturate at the permit count, drain to
completion, and stop when their consumers unsubscribe.

## Permit count: 8

Four permits were a guess. On 2026-11-08 a Pixel 8 Pro read the same 35 public
film pages (about 160 KB each) at three widths, back to back:

| Parallel reads | Wall time | Mean request |
| --- | --- | --- |
| 4 | 5.8 s | 639 ms |
| 8 | 3.1 s | 670 ms |
| 12 | 2.3 s | 697 ms |

Request latency stayed flat and no read returned 429, so Letterboxd did not
throttle the wider fan. Eight keeps most of the gain with headroom below the
widest tested width. A 34-film list issued 83 page reads at four permits
(identity, watch, and poster recovery), and its watched count settled 9.4 s
after the tap. Poster recovery now reuses the identity read instead of
fetching the same page again.
