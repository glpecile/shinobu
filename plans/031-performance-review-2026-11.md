# Plan 031: Performance review, the five slowest spots from a device profile

> **Executor instructions**: The leaves marked **DONE (this PR)** shipped with
> the PR that added this plan. Work the open follow-ups top to bottom. Before
> each one, re-profile the same scenario (below) so the "now" column is
> current, and honor its STOP conditions. Update the row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 1994ac9..HEAD -- src/features/diary src/features/episode-details src/lib/http/fourchan.ts src/state/queries/discussions.ts`

## Status

- **Priority**: P2 (diary leaves were P1 and are done)
- **Effort**: M overall; each follow-up is S–M
- **Risk**: LOW–MED (follow-up B changes swipe-reveal UX)
- **Category**: perf
- **Planned at**: commit `1994ac9`, 2026-11-02

## How it was measured

- **Devices**: iPhone 17 Pro simulator (iOS 26.5) for the full scenario, plus
  a Pixel 8 Pro (Android 17) for the diary before/after. Dev builds (Hermes,
  React Compiler on), the owner's real accounts: 294 diary logs (227 Simkl),
  82 queries in the cache.
- **Scenario** (52 s, scripted with argent): pull to refresh on Home, scroll
  Home, open an episode from Continue Watching, go back, open Diary, scroll it
  four times, go back to Home.
- **Tools**: argent `react-profiler` (Hermes CPU sampling and React commits)
  plus Instruments. Pure functions were timed in the app's own Hermes runtime
  through `debugger-evaluate`, with the cached diary as input.
- Dev builds run about 3× slower than release. Treat the ratios as the signal,
  not the absolute milliseconds.

## The five slowest spots

| # | Spot | Time now (before) | Case matched | Where | Speedup |
|---|------|-------------------|--------------|-------|---------|
| 1 | Diary scroll rebuilds every row and both month calendars on each sticky-header change | 27 hot commits, **2,076 ms** in 10 s of scrolling (worst 191 ms); `DiaryMonth` 15 renders; 5,555 ms busy JS | Uses a cache (React Compiler memo) that was silently off | `src/features/diary/diary-list.tsx` `DiaryList` (L733–990), `DiaryStickyDate` (L85) | **DONE.** iOS sim: total commit time **20×** less (2,211 → 108 ms), hot commits 27 → 2, `DiaryMonth` 15 → 1 render (a real mount), busy JS **2.9×** less. Pixel 8 Pro: total commit time **1.6×** less (1,524 → 950 ms), worst commit 315 → 198 ms, `DiaryMonth` 4 → 0 renders; the remainder is LegendList recycling rows, which both runs pay |
| 2 | Opening an episode mounts both neighbour pages at full fidelity | 5 hot commits, **704 ms**; the deferred neighbour pass alone is **228 ms** (3× `EpisodePage`, 124 `Skeleton`, 4 people rails, 2 discussion and 2 ratings sections nobody can see) | Nothing matched, so data-oriented: produce data, not views, for off-screen pages | `src/features/episode-details/screen/index.tsx` `EpisodePager` (L73–168), `EpisodePage` (L175) | Expected **~3×** on the 228 ms commit; open follow-up B |
| 3 | Diary merge sort parses two ISO dates per comparison | **3.32 ms** per merge (2,396 comparisons for 294 logs; the sort is 92% of it) | AoS → SoA: the sort reads one field, so parse it once into a key column | `src/features/diary/merge.ts` `mergeDiaryEntries` (L62) | **DONE: 4.3×** (0.77 ms); the sort alone **8.6×** (3.05 → 0.36 ms) |
| 4 | Diary day collapse scans every bucket's identity set per entry | **3.84 ms** per regroup | Hot loop hitting hash tables: a flat bucket array indexed by `episodesKey + identity`, and precomputed within-day sort keys | `src/features/diary/merge.ts` `collapseDay` (L360), `sortMergedDesc` (L350) | **DONE: 1.15×** (3.33 ms). Less than expected: the remainder is per-bucket allocation in `toMerged`; see follow-up D |
| 5 | Discussion matching re-normalizes the whole catalog for every item and every `select` | ~0.5 ms per board per call on JSC (≈3–6 ms on Hermes); 70% of it is item-independent; runs ×3 per episode open (one per mounted page) | Nothing matched, so data-oriented: do item-independent work once per fetch in the producer | `src/lib/http/fourchan.ts` `matchDiscussionThreads` (L70), `getDiscussionCatalog` (L46); `src/lib/http/reddit.ts` `getSubredditSearch` (L32) | Expected **~3×** per match; open follow-up C |

Ruled out: `useIsFetching` in `DiscussionSection` showed up as
`partialMatchKey` in the profile, but the cache holds 82 queries and
`queryClient.isFetching` costs 0.08 ms. LegendList's own `runCalculateItems`
(159 ms during diary scroll) is library code; spot 1 halved it to 81 ms
because the list no longer gets new data on every scroll.

### What spot 1 actually was

`DiaryList` was compiled, but no derived value in it was memoized:

1. `refresh()` used `try { … } finally { … }` without a `catch`. React Compiler
   can't lower that, so it skipped the **whole component**.
2. Once it compiled, `activityProps.today` was a ref-tainted read: the object
   holds a closure over `listRef`, so the compiler refused it.
3. Even then, `flattenDays(…)` wasn't memoized. Its inputs (`hiddenIds`,
   `today`, the `keep` closure) were made before later hook calls, and
   `items.find(…)` plus `formatDayDate(…)` inside the JSX merged the sticky
   header into the same scope. Its dependencies included `sticky`, so every
   sticky-header change while scrolling rebuilt all rows and handed both
   `DiaryMonth`s a new `activity` map.

The fix keeps every hook above the derivation and passes only plain values
into `flattenDays`. `DiaryStickyDate` now reads its day's summary from
`activity` (a map lookup instead of a scan of the rows). `now` became state
with a midnight wake, because a compiled `new Date()` would freeze "today".
Details and the check script are in
`docs/solutions/react-compiler-silent-bailouts.md`.

## Caches in the codebase, and which hide a slow design

| Cache | Where | Verdict |
|-------|-------|---------|
| React Compiler memo of the diary rows | `diary-list.tsx` | **Was hiding a slow design.** Every render rebuilt the rows and both calendars, and the memo that should have absorbed that was off. Fixed so the derivation runs once per data change; no cache was added. If it ever gets slow again, make `flattenDays` append-only per page rather than adding a cache. |
| React Compiler memo everywhere else | 14 files bail out today | **Hiding slow designs, unknown size.** See follow-up A. |
| `resolve-item.ts`, `search-cache.ts`, `watchlist-cache.ts` scans | `src/state/queries/` | **Cache used as a lookup table.** A tapped item is resolved by `getQueriesData` plus a linear `find` over every cached list. Cheap at today's 82 queries (8.6 ms sampled on episode open). The fast-on-its-own design passes the item, or its index, through navigation. Not worth doing until the cache grows. |
| `dayFormatters`, `timeFormatters`, `calendarFormatters` | `features/diary/merge.ts`, `lib/time/calendar-date.ts` | Fine. Hermes builds an `Intl.DateTimeFormat` per call, which is platform cost, not app design. |
| Hidden-items snapshot cache | `state/prefs/hidden-items.ts` | Fine. `useSyncExternalStore` requires a stable snapshot. |
| TanStack persisted queries | `state/queries/persist.ts` | Fine. Offline and instant first paint, not a cover for compute. |
| Launch replay | `lib/http/launch-replay.ts` | Fine. It hides network latency, which no redesign removes. |
| AniList cooldowns, Trakt in-flight refreshes | `lib/providers/*` | Not caches: rate-limit and dedupe state. |

## Open follow-ups

### A. React Compiler bailouts fail the lint (P2, M)

`node`, with `babel-plugin-react-compiler` and a `logger`, over every
non-test file in `src/` (excluding `src/app/dev/`) finds 14 components the
compiler skips:

- `try` without `catch`, or with `finally`: `app/anime-seasons/index.tsx:102`,
  `app/watchlist/index.tsx:151`, `features/lists/lists-grid.tsx:76`,
  `features/notifications/notifications-settings/index.native.tsx:105`,
  `components/connect-serializd-button/index.tsx:44`,
  `lib/open-external-url/use-link-handoff.ts:11`
- Value blocks inside `try/catch`: `components/connect-simkl-button.tsx:121`
- Reanimated `.value` writes the compiler treats as mutation:
  `components/pager.tsx:138,147,189`, `components/scrolled-title.tsx:124`,
  `features/credit-timeline/credit-timeline.tsx:265,306`
- Ref passed to a function in render:
  `components/provider-signin-webview/index.native.tsx:169–174`
- Unsupported syntax: `features/settings/settings-rail.tsx:226` (computed key
  in a destructure), `features/show-seasons/season-accordion.tsx:45`,
  `state/queries/persist-provider.tsx:81` (`??=`)

Steps: load `eslint-plugin-react-hooks` (v6 ships the compiler rule) as an
oxlint JS plugin with `react-hooks/react-compiler: error`, the same way
`.oxlintrc.json` loads `@shadcn/lint`. Fix each file the way
`diary-list.tsx` was fixed (`.finally()`, `.set()` for shared values, hoist
calls out of JSX). Profile `pager.tsx` and `credit-timeline.tsx` first,
since they sit on scroll paths.
**STOP** if the plugin can't run under oxlint's JS plugin API. Fall back to a
`bun` script in CI, built from `docs/solutions/react-compiler-silent-bailouts.md`.

### B. Episode neighbours render data, not full pages (P2, M, owner decision)

`EpisodePage`'s doc says neighbours mount "so a neighbour is complete before
the swipe reveals it". Keep that promise with data: for the neighbour
episodes, `prefetchQuery` the reads that `EpisodeCreditsSection`,
`DiscussionSection` and `RatingsSection` suspend on, and render only the
hero, heading and overview. Mount the sections when the page becomes
`settled`. Expected: the 228 ms neighbour commit drops to about a third, and
discussion matching (spot 5) runs once instead of three times.
**STOP** if the sections visibly pop in on a swipe, and ask the owner.

### C. Normalize discussion catalogs once, in the producer (P3, S)

Have `getDiscussionCatalog` and `getSubredditSearch` return each thread with
its item-independent fields precomputed: `text` (normalized subject plus
opening), `subjectText`, and the parsed episode markers. Then
`matchDiscussionThreads` only runs substring checks. The three hand-built
catalogs in `fourchan.test.ts` gain the new fields, or build them through a
small exported `indexThread()`. Discussion queries aren't persisted, so no
cache migration is needed.

### D. Collapse skips the merge fold for single-contributor buckets (P3, S)

Most diary buckets have one contributor, yet `toMerged` still sorts, folds,
builds a `Set` of episodes and re-sorts providers for each one. Return the
entry as a `MergedDiaryEntry` directly when `bucket.entries.length === 1`.
Optionally store providers as a 5-bit mask on the bucket instead of a
`Set<ProviderId>`. Re-time `groupDiaryEntries` in the app (method above). Ship
only if it beats the 3.33 ms by at least 30%.
