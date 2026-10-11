# Letterboxd TV metadata and variants

## Phase 1

- Resolve public Letterboxd film pages on native and web through the existing
  GET-only transport. Preserve slug identity and provider progress on cold links.
- Prefer exact embedded TMDB movie identity. Otherwise require a unique exact
  normalized title and year from TMDB movie search, then TV search.
- Store a TV match as `tmdbTvVariant`, never as a movie external ID. Use it for
  detail metadata and a typed TV variant link only. Do not merge TV tracker IDs,
  episode counts, or progress into the Letterboxd entry.
- Offer a reciprocal Letterboxd variant from cached watchlist, diary and list
  entries with the same exact title/year or resolved TV relationship.
- Leave writes, completion logging, feed and watchlist deduplication unchanged.
  Skip movie identity searches for a known TV relationship so logging cannot
  guess an unrelated film's write target.

## Validation

Exercise metadata resolution and ambiguity at the provider HTTP boundary,
typed variant navigation, lint, typecheck and the existing detail tests.
JS-only changes: hot reload, no native rebuild.

Verified the cold Letterboxd URL in Safari on the iPhone 17 Pro simulator:
TMDB synopsis, rating, genres, cast, crew and studios render; its TMDB variant
opens the TV page with separate episode progress, and that page offers the
reciprocal Letterboxd variant. The final return tap was not delivered because
the simulator transport disconnected; reverse-link presence and route typing
were verified structurally and by tests, not a completed return navigation.

`bun test --isolate`: 1,347 passed. Lint, typecheck, class-name, guarded-navigation,
external-link checks and `git diff --check` passed.
