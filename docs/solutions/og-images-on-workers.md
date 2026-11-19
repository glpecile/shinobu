# Link previews on Cloudflare Workers

**Found 2026-11-02 (plan 0118).**

## Dynamic routes answered 404

The static export has no file for `/details/tmdb/movie-603`, so the assets
router served `404.html` with status 404. The SPA booted fine, but crawlers
skip a 404 and never read its tags. Those paths now go through
`run_worker_first`. `withPageMeta` (`worker/og.ts`) returns 200 for paths
`parseCardPath` recognizes and keeps the 404 for everything else.

The shell also has no `<title>`. When metadata cannot resolve, keep the site
image and description and inject `Shinobu` as the title and `og:title`, so
shared links still have a complete site preview.

Simkl's `/search/id` supplies the media type but no overview. Follow it with
the typed `/movies`, `/tv`, or `/anime` detail read with `extended=full` for
the description. Anime details also supply the English title as `en_title`.

Workers Builds variables only reach the build. The metadata reader needs
`EXPO_PUBLIC_TMDB_TOKEN` and `EXPO_PUBLIC_SIMKL_CLIENT_ID` in the Worker's
runtime Variables and Secrets too; otherwise those links use the site card.

## Render PNG cards from precompiled WASM

Satori 0.33 added HarfBuzz text shaping. Its loader assumes `self.location`
exists and compiles WASM at runtime. Both assumptions fail on Workers. This
affects 0.33.5, which fixed an SVG escaping flaw, and 0.63.2 as well.

Takumi converts the JSX template to a PNG using a WASM module precompiled by
Wrangler. Check `/og/site.png` under `wrangler dev` after renderer upgrades.
[Satori advisory](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp) ·
[Workers compatibility issue](https://github.com/vercel/satori/issues/878)

## Render cost

On an M-series Mac under bun, Takumi renders a 1200×630 card without images in
about 5 ms. Satori and resvg took about 166 ms. Cards with posters and Workers
CPU time were not measured, so keep Workers Paid; the free plan allows 10 ms.
The Cache API keeps the cost to one render per card per week.

The renderer's resource cache is off (`cacheMaxBytes: 0`, default 64 MiB).
Otherwise decoded posters stay in the isolate's WASM memory between requests,
up to that budget.
