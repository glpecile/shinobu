# Serializd lists and Simkl lists link

## Scope

- Add Serializd created and liked list rails to Home, sharing the existing list
  cards/grid/header. Both indexes paginate lazily and share cached pages with
  View all. Home pull-to-refresh includes both.
- Open Serializd list details in the existing lists route with provider/list ID
  parameters. Render show/season/episode entries without merging duplicate shows.
  Keep private reads account-scoped; clear caches through the existing provider
  disconnect root. Empty/error/incomplete responses retain external recovery.
- Add only a numeric `list/{id}` GET grant to the existing Serializd Worker.
  No mobile-prefix proxy or mutation grants.
- Add a Simkl lists link with clear external-only copy. The owner explicitly
  deferred AUTH V2 migration and in-app Simkl custom lists.
- No list creation/editing/like writes, new dependencies, or native changes.

## Validation

Provider parsing/paging and incomplete-list regressions, Worker allowlist tests,
live public Serializd index/detail reads, full repo checks and web export. Check
the shared Letterboxd layout for regressions. JS-only hot reload; the new web
GET allowlist requires deploying/restarting the Worker, not a native rebuild.

## Result

- Implemented created/liked Serializd rails, paged indexes, list detail rows,
  and the external Simkl entry. Cards, grid, header, and external-link button
  are shared with Letterboxd. List-detail cache resolution is account-scoped.
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
