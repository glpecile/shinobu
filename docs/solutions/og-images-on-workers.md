# Link previews: 404 shells, satori on Workers, and render cost

**Found 2026-11-02 (plan 0118).**

## Dynamic routes answered 404

The static export has no file for `/details/tmdb/movie-603`, so the assets
router served `404.html` with status 404. The SPA booted fine, but crawlers
skip a 404 and never read its tags. Those paths now go through
`run_worker_first`. `withPageMeta` (`worker/og.ts`) returns 200 for paths
`parseCardPath` recognizes and keeps the 404 for everything else.

## satori ≥ 0.33 does not run on Workers

satori 0.33 added HarfBuzz text shaping. Its Emscripten glue reads
`self.location.href` when `WorkerGlobalScope` exists. Workers have no
`location`, so the first render throws `Cannot read properties of undefined
(reading 'href')`. `satori/standalone`'s `init()` loads only the layout wasm,
not HarfBuzz. `satori` is pinned to **0.32.0**, the last release without
HarfBuzz (Bluesky's bskyogcard is on 0.26). Retry newer releases only after
confirming `/og/site.png` renders under `wrangler dev`.

Workers also refuse to compile WebAssembly from bytes, so both `yoga.wasm` and
resvg's wasm are imported as modules that wrangler precompiles.

## Render cost

On an M-series Mac, satori takes ~6 ms and resvg ~160 ms per 1200×630 card.
That is far over the free plan's 10 ms CPU limit, so this needs Workers Paid.
The Cache API keeps the cost to one render per card per week.
