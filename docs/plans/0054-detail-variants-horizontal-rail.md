# Detail variants horizontal rail

## Scope

- Replace the wrapping Variants grid with the existing horizontal `Rail`,
  preserving poster dimensions, 12px gaps, provider marks and navigation.
- Keep it non-virtualized: `detailVariants` offers at most four sources.
- Audit the detail screen without changing unrelated layouts. Cast, crew,
  characters, Related and Recommendations already use `List`. Studios, provider
  links and the three release stops are small; wrapping tags are lightweight.
- Expanded season episode lists are the remaining substantial candidate,
  particularly for long-running anime. A follow-up should flatten season headers
  and visible episodes into the page's vertical list, not nest a full-height
  vertical `List` inside `RefreshableScrollView`. Closed episodes are unmounted
  on native; web retains them after first opening for the closing transition.

## Validation

Lint, typecheck, class-name checks, existing variant tests (4 cases) and
`git diff --check` passed. On the running iPhone 17 Pro simulator, Vampire Hunter
D's three variants stayed on one row; a horizontal swipe exposed the trailing
Letterboxd card fully and removed the end fade. JS-only: hot reload; no native
rebuild.
