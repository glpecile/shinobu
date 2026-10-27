---
status: pending
priority: P2
---

# Tracking workflow improvements

## Reconciliation, 2026-10-23

This file is a collection of proposals, not one implementation task.
Sorting #226 is closed: PR #254 added it and PR #265 subsequently replaced
runtime sorting with alphabetical sorting. Current choices are original order,
title A to Z/Z to A, and release year in both directions. Do not restore
runtime sorting from the original issue requirements.

The next scoped tracking feature is pause/drop in #227, starting with provider
verification and a focused plan. Personal ratings remain a separate spike.
Title preferences, progress explanations, local search, recent searches,
identity corrections and preference transfer remain proposals. See
[the backlog index](README.md) for operational priorities and issue coverage.

Drafted 2026-10-12 after a quick source review of tracking, library browsing,
search history, identity matching and export workflows, checked against Shinobu's
current implementation. These are proposals, not verified bugs or approved
implementation scope. Paths below are relative to the repository root.

## Revised priorities, 2026-10-12

Owner feedback: generic search/history features are not the purpose of this
review. Prioritize runtime and release-year sorting separately, then focus on
the provider-specific tracking gaps below. The original convenience proposals
remain lower-priority background, not the recommended next issues.

**Resolved:** [#226](https://github.com/glpecile/shinobu/issues/226), followed by
the alphabetical-sort replacement in PR #265. Text search and recent searches
were not part of that implementation.

## Provider-specific candidates

The shared providers are AniList and Simkl. MyAnimeList is currently an identity
bridge in Shinobu, not a connected tracking provider. The useful comparison is
what users can change in their provider entries, not how many UI features exist.

### A. P2 — Pause and drop tracking without deleting history

Tracked in [#227](https://github.com/glpecile/shinobu/issues/227).
Owner decision: no Resume or Restart action. Logging another episode of either
a paused or dropped series resumes tracking on each selected provider whose
log succeeds, or completes the entry when appropriate. Failed writes must not
appear resumed.

**Observed gap:** `src/lib/providers/anilist/writes.ts` exposes logging and
planning/removal, not an explicit PAUSED/DROPPED/resume action. Simkl normalizes
`hold` and `dropped` in `src/lib/providers/simkl/normalize.ts`, but the current
write workflow is history + watchlist, not a user-facing status editor.

- [ ] Spike status-only edits: AniList PAUSED/DROPPED/CURRENT and Simkl
  hold/dropped/watching. Confirm the API behavior preserves progress and history.
- [ ] Offer Pause tracking and Drop in the existing item actions. Show
  which connected providers support the chosen action and their current status.
- [ ] Route by a declared operation capability in the registry/routing boundary;
  `canWrite` for logging does not establish status-edit support. Keep other
  providers untouched and explain unsupported actions through provider links.
- [ ] Reuse the existing per-provider write report and failure/retry machinery.
  Do not implement pause as hide, watchlist removal or history deletion.
- [ ] Invalidate existing feed/Up Next reads so paused/dropped items stop being
  offered there. Keep logging available from details/search; reuse the existing
  log adapters' status transitions where possible. A new episode log resumes
  paused/dropped tracking without introducing another control or unnecessary
  status request. Preserve existing catch-up, completion and rewatch semantics.

**Why this fits:** it closes a tracking lifecycle gap across the two shared
providers while preserving Shinobu's one-action/multiple-provider purpose.
Acceptance must include divergent statuses and a successful status change on
one provider while the other fails. Not a full-library browsing project.

### B. P2 spike — Personal ratings with explicit provider score semantics

**Observed gap:** `NormalizedMediaItem.rating` is a community score. The current
`LogMediaVariables` supports likes/tags, not a personal rating, and AniList's
save mutation does not send a score. Community and personal ratings must never
share that field.

- [ ] Verify rating writes and clearing semantics on AniList and Simkl first.
  Read AniList's account `mediaListOptions.scoreFormat`: 100-point, integer or
  decimal 10-point, 5-star and 3-face scales are not interchangeable sliders.
- [ ] Design a separate rating intent, showing each target's resulting score
  before confirmation. Do not silently treat a 3-face score as precise /100 data.
- [ ] Keep rating-only edits independent from logging. Rating a film already
  watched everywhere must not enter the current parity-rewatch branch in
  `src/features/log-media/reconcile.ts`.
- [ ] Store personal scores beside provider entry state, not on catalog metadata.
  Preserve status, progress, repeat counts and other omitted entry fields; verify
  patch behavior before issuing writes. Clearing is explicit, not “zero”.
- [ ] Add other providers only after verifying their own API/platform support.
  No new Letterboxd POST proxy and no “Saved everywhere” when a target cannot rate.

**Why this fits:** it extends the actual multi-provider write contract, rather
than adds another browsing control. Start as an API/interaction spike; no new
issue is created for this proposal yet.

### C. P3 — Respect the AniList account's title preference

**Observed gap:** `anilistTitle()` in `src/lib/providers/anilist/normalize.ts`
always prefers English. `getViewer()` fetches only id/name, and card fields ask
for english/romaji/native, not `userPreferred`.

- [ ] Check authenticated AniList `title.userPreferred` and account title-language
  options, then decide between provider-supplied preferred titles and a small
  display selector over the alternate names already retained.
- [ ] Cover English, romaji and native preferences with the existing missing-name
  fallback; keep every alternate name for search/copy/matching.
- [ ] Keep display choice out of identity matching: selecting native titles must
  not change a provider ID, break movie matching or duplicate a watchlist entry.
- [ ] Keep public catalog caches account-independent unless the returned title
  actually varies by viewer. Account-dependent data must refresh on reconnect.

**Why this fits:** it fixes a concrete mismatch with an existing provider
setting, without a new theme system or a local media database.

### D. P3 — Show progress disagreements before catch-up

**Observed baseline:** Shinobu already reconciles each intended watch and skips
providers that have it. Do not build a second sync engine. Provider-specific
entry state can still be more informative than the merged card's one progress
number, especially for cour-split anime.

- [ ] Evaluate a compact breakdown in the existing write sheet: AniList entry
  progress, Simkl entry progress and the intended canonical season/episode.
  Reuse the preflight reads; do not add a background library scan.
- [ ] Label unknown/mapping-failed state separately from zero/unwatched. Show
  the reason a provider will be skipped before the user confirms.
- [ ] Present raw progress in its own domain: AniList 3/12 and TMDB S02E03 may
  describe the same watch. Compare only after mapping, never by taking the
  largest raw number or copying it to every provider.
- [ ] Keep catch-up an explicit action using the existing reconciliation and
  write reports. No automatic bidirectional repair on app startup.

**Why this fits:** it makes the app's cross-provider episode translation visible
and diagnosable instead of borrowing a generic “sync” button. Identity correction
in item 3 below is a possible later action, not a prerequisite for this display.

## Boundaries

- Keep providers symmetric and opt-in. No local media database, Shinobu account,
  cloud sync, new proxy, player, reader or extension system.
- Reuse TanStack Query, MMKV preferences and the existing component wrappers.
  No dependency is needed for the first two items.
- Unified logging, failed-only write retries, manual provider links, calendars,
  list browsing and grid/list preferences already exist. Improve those paths
  rather than build alternatives.
- Coordinate with `docs/plans/0080-anilist-query-budget.md`; do not widen AniList
  requests or change cache persistence as a side effect of these features.

## 1. Sorting resolved; local title search remains optional

Implemented sorting lives in `src/lib/media-sort.ts`,
`src/features/media-layout/media-sort-control.tsx`, and
`src/state/prefs/media-sort.ts`. Watchlist filtering precedes sorting and both
layouts receive the same result. PR #265 replaced runtime choices with
alphabetical choices; release-year sorting remains. Partial lists show
"Sorting loaded titles" and retain existing pagination. See
`docs/plans/0085-watchlist-and-list-sorting.md` for the implementation history.

Local title search remains a separate, lower-priority proposal:

- [ ] Match title, alternate titles and aliases over loaded entries without
      provider requests. Compose with the existing provider filter and sort.
- [ ] Derive the visible array during render. Keep transient filters in route
      params through `src/lib/routes.ts`; preserve existing sort preferences.
- [ ] Preserve underlying tracker counts, show the visible result count
      separately, and distinguish no matches from an empty watchlist.
- [ ] Label partial search "Searching loaded titles" and keep Load more
      reachable even when the current filter returns no rows.

Do not scrape every Letterboxd page to make filtering appear complete. If this
proposal is selected, extend neighboring filter tests only for new branches.

## 2. Deferred — Recent searches with scope and privacy controls

**Current:** `src/app/(tabs)/search.tsx` supports titles, people and studios, with
debounced queries and URL state. `src/state/queries/search-cache.ts` resolves
results from the query cache; it is not a user-facing search history.

- [ ] Store at most 10 recent `{ query, scope }` records in preferences. Reuse
  the bounded-array, stable-snapshot and SSR-safe pattern in
  `src/state/prefs/recent-tags.ts`, without extracting a storage framework.
- [ ] Record a search when the user opens a result or explicitly submits it,
  not for each debounced intermediate string. Trim whitespace, dedupe within
  the same scope and retain the user's displayed casing.
- [ ] Show recents only when the field is empty. Selecting one restores both
  its query and scope through the current search path.
- [ ] Offer individual removal and Clear history. Do not include search history
  in preference exports by default.

Keep the scope FAB and sheet: `todos/019-in-progress-p3-native-expo-ui-opportunities.md`
records the owner's preference for that interaction. No new provider searches,
query persistence allowlist or per-keystroke storage effect.

**Done when:** selecting a studio recent does not run a title search; repeats
move to the front; empty searches are ignored; clear/removal survive restart;
web prerender never touches browser storage. Follow neighboring preference
tests for the bounded merge and removal behavior only.

## 3. P3 — Repair a missing or incorrect provider identity

**Current:** `src/features/log-media/enrich.ts` and
`src/state/queries/mapping.ts` enrich cross-provider IDs automatically. Mapping
misses can remain cached indefinitely, and users have manual provider links,
but no inspected path here offers an explicit identity correction.

Start with a small spike, not a new matching engine:

- [ ] Trace how details, watchlist actions and writes consume identity lookups.
  Identify the shared resolution boundary before adding an override.
- [ ] Propose “Correct tracker match” only for missing or disputed mappings.
  Show the current match and let the user choose a provider item using supported
  search or a validated provider URL/ID. Confirm title, year and format.
- [ ] If the spike supports it, persist only explicit identity overrides as
  local preferences, keyed by source identity and destination provider. Provide
  a reset action and invalidate just the affected mapping and dependent queries.
- [ ] Make the override apply consistently to reads and writes. Never replace
  a whole normalized item with a locally stored copy or infer a match by title
  alone without confirmation.

**Safety gate:** an entry match is not an episode-number mapping. Do not allow
this feature to equate anime cours, TV seasons or whole-entry film variants.
Read `docs/solutions/simkl-anime-cour-episode-mapping.md` and the existing season
mapping code before deciding which matches can safely be corrected. No write
is sent merely because the user saves a match.

**Done when:** a corrected identity is used by every relevant consumer, reset
restores automatic lookup, unsupported provider/platform combinations keep their
manual link, and anime ambiguity cannot redirect progress to the wrong season.
Write a focused feature plan with the spike results before implementation.

## 4. P3 — Export and restore local preferences, not sessions

Provider libraries already live with their providers. The portable data Shinobu
owns is device preference state in `src/state/prefs/`, currently separate from
tokens and the disposable query cache.

- [ ] Add an explicit, versioned JSON allowlist for useful preferences: hidden
  items, collapsed sections and watchlist layout/sort. Include identity overrides
  only if item 3 is implemented and their validation rules are settled.
- [ ] Exclude tokens, client secrets, TMDB tokens, WebView cookies, query cache,
  search history and provider library payloads. Never dump an MMKV store wholesale.
- [ ] Validate the entire import using installed Zod before changing storage.
  Reject unsupported versions and invalid values without partially applying them.
- [ ] Preview the affected preferences and confirm replacement of only the
  listed keys. Restore through the existing preference setters so mounted views
  receive normal change notifications. Do not add merge/conflict modes yet.
- [ ] Begin with a JSON copy/paste flow using the installed clipboard and shared
  text-field/button wrappers. Add native file sharing only if that proves useful
  enough to justify a separately approved dependency.

**Done when:** export contains no secrets, invalid imports leave preferences
unchanged, unlisted preferences remain intact, and import never connects a
provider, sends a provider write or restores pending mutations. This is a
preferences transfer, not a backup of watch history.

## Optional follow-ups, only after the core work

- **Pick a title:** one action selecting from the currently visible watchlist
  and navigating to details. No autoplay, scoring model or recommendation API.
  Label it “Pick from loaded titles” while paging is incomplete; never pick from
  entries hidden by the current filters.
- **Broader library status views:** evaluate watching/reading, paused, completed
  and dropped views only after measuring the provider fetch cost and agreeing
  on cross-provider status semantics. Do not turn the current watchlist query
  into a full-library request or assume manga belongs in an episode feed.
- **Read-only export:** if requested, export loaded watchlist entries with source
  IDs, timestamp and completeness markers. Do not describe a paginated snapshot
  as a complete backup or add bulk provider imports in the same feature.

## Delivery order and validation

Sorting through #226 is resolved. Next, plan provider-specific candidate A
and spike B separately; C is a smaller provider-preference improvement, while D improves
visibility into existing reconciliation. Recent searches and preference transfers
are not the recommended next issues. Spike item 3 before committing to its UI
or storage shape. Write a focused `docs/plans/`
entry before implementing each feature rather than treat this backlog as one PR.

For implemented changes, run the affected neighboring tests, `bun typecheck`,
`bun lint` and `bun check:links`.
Check iOS, Android and web with larger text, keyboard/screen-reader navigation,
light/dark themes and partial provider failures. Local browsing/search-history
features must add zero provider requests while interacting with cached data.

This todo changes no runtime behavior and needs no rebuild. Implementations
using existing JS/TS dependencies hot reload; any approved native dependency or
config change requires `bun ios:clean` / `bun android:clean`.
