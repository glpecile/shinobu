# Serializd lists and Simkl lists link

## Scope

- Add Serializd created and liked list rails to Home, sharing the existing list
  cards/grid/header. Both indexes paginate lazily and share cached pages with
  View all. Home pull-to-refresh includes both.
- Give each provider a list index and resource detail route:
  `/lists/letterboxd/[owner]/[slug]` and `/lists/serializd/[id]`.
  Keep `kind` as an index filter, and redirect valid legacy `/lists` links.
  Share the page frame, not a query-parameter screen dispatcher.
  Render show/season/episode entries without merging duplicate shows.
  Keep private reads account-scoped; clear caches through the existing provider
  disconnect root. Empty/error/incomplete responses retain external recovery.
- Add only a numeric `list/{id}` GET grant to the existing Serializd Worker.
  No mobile-prefix proxy or mutation grants.
- Add a Simkl lists link with clear external-only copy, shown only when there
  are lists to display in-app. The owner explicitly deferred AUTH V2 migration
  and in-app Simkl custom lists, so the link is dormant until those land.
- No list creation/editing/like writes, new dependencies, or native changes.
- Match media-card captions to list metadata (small and muted), and show the
  source of the destination item on the poster, not the row's provider.

## Validation

Provider parsing/paging and incomplete-list regressions, Worker allowlist tests,
live public Serializd index/detail reads, full repo checks and web export. Check
the shared Letterboxd layout for regressions. JS-only hot reload; the new web
GET allowlist requires deploying/restarting the Worker, not a native rebuild.

## Result

- Implemented created/liked Serializd rails, paged indexes, and list detail
  rows. Cards, grid, header, and external-link button are shared with
  Letterboxd. List-detail cache resolution is account-scoped.
- The Simkl lists entry follows the same rule as the list sections — it only
  renders when there are lists to display — so with in-app Simkl lists deferred
  there is no Simkl block on Home today. The scope note above records that the
  entry returns when in-app Simkl lists exist.
- Live provider reads passed for Maurizio82's created index, openminded03's
  four liked lists, list 732170 (33 show entries), and list 730655 (five episode
  entries). These probes were public and changed no provider data.
- iOS verified detail loading, posters, a long two-line title, the disconnected
  index prompt, and Breaking Bad's list episode → S1E1 detail navigation.
  Letterboxd's liked-list empty state still has its external recovery action.
- 1,296 tests, typecheck, lint, class-name/navigation/link checks,
  `git diff --check`, and production web export passed.
- Post-merge review passes (ponytail + code review) found and fixed: episode-0
  entries no longer fail a whole list decode; a season entry without `seasonId`
  no longer collapses onto the show entry's id; usernames containing `..` are
  rejected up front (they would 404 through the web proxy); the cache lookup
  sources its username exactly like the write key; and the two /lists screens
  merged into one provider-aware screen, sharing the index grid/empty/footer
  and the detail header skeleton.
- No signed-in Serializd account was available on the simulator: private lists,
  Home's populated Serializd rails, and browser/Android runtime interactions
  were not verified live. Provider parsing/paging and the exact web proxy grant
  are covered by tests. No list likes or session credentials were changed.

## Further PR review

- Replaced the parameter-dispatched screen with provider index and resource
  detail pages, retaining a strict, `switch`-based legacy redirect. The shared
  frame keeps loading, retry, back navigation, and external recovery consistent.
  Index boundaries reset when the account or `kind` changes.
- Fixed Serializd query authentication to match its cache-key account, including
  anonymous reads during hydration. See
  `docs/solutions/serializd-list-query-account-isolation.md`.
- Removed the completed card-design prototype, the single-caller grid wrapper,
  and tests that only restated `Intl.NumberFormat` behavior.
- Media captions now use list-card metadata sizing/color and show the destination
  item's provider mark. Screen-reader labels retain progress and subtitle context.
- 1,302 tests, typecheck, lint, class-name/navigation/link checks, whitespace
  checks, and production web export passed. iOS verified Home poster captions,
  Letterboxd Home → index → detail → back, a public Serializd resource deep link,
  legacy index redirects, and unknown-provider recovery. The three incoming-link
  checks also passed an uninterrupted recorded replay. Refreshed README detail
  and person screenshots from Chromium to show the muted captions and source
  badges. Route centralization is enforced by `shinobu/no-hardcoded-routes` in
  lint and CI, with one regression check. Private Serializd lists and
  Android/browser list flows remain unverified; no provider data or sessions changed.
