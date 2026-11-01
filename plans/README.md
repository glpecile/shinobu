# Implementation Plans

Handoff plans written by the `improve` skill for executor agents. Product plans
stay in `docs/plans/`. Each executor: read the plan fully before starting,
honor its STOP conditions, and update your row when done.

- Round 1: 2026-10-26 against commit `04cc56e` (plans 001–004).
- Round 2: 2026-10-31 against commit `1003c59` (plans 005–030), a full audit
  covering correctness, security, performance, tests, tech debt, DX, docs and direction.

Status values: TODO | IN PROGRESS | DONE | NEEDS REVISION (review finding) | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Round 2: ranked index (2026-10-31)

Ranked by leverage: severity × confidence ÷ effort, with security and
unblocking work floated up. Work top to bottom unless a dependency says otherwise.

| Rank | Plan | Title | Category | Priority | Effort | Risk | Depends on | Status |
|-----:|------|-------|----------|----------|--------|------|------------|--------|
| 1 | [005](005-simkl-reconcile-blocks-rewatches.md) | A provider whose watch state can't be read no longer blocks rewatches elsewhere | bug | P1 | S | LOW | — | DONE (#369) |
| 2 | [006](006-disconnect-purges-diary.md) | Disconnecting a provider also drops the cached unified diary | bug / privacy | P1 | S | LOW | — | DONE (#368) |
| 3 | [008](008-readme-token-encryption-claim.md) | The README stops claiming tokens are encrypted | docs (security claim) | P1 | S | LOW | — | DONE (#378) |
| 4 | [009](009-simkl-unbuildable-entry-skips-alone.md) | An unbuildable Simkl log is skipped on its own, never coalesced into a batch's `ok` | bug | P1 | S | LOW | — | DONE (#374) |
| 5 | [007](007-web-oauth-returns-need-a-pending-flow.md) | Web OAuth returns only complete a connect this browser started (AniList login CSRF, Trakt `state`, Trakt reconnect) | security + bug | P1 | M | MED | — | BLOCKED (#382; exact `state` now required; needs one real web AniList connect to confirm the echo) |
| 6 | [010](010-mapping-lookups-dont-cache-transient-failures.md) | Identity and title lookups stop caching a network failure as "no match" | bug | P2 | S–M | LOW | — | DONE (#377) |
| 7 | [011](011-trakt-continue-watching-reports-total-failure.md) | Trakt Continue Watching reports an error when every progress call fails | bug | P2 | S | LOW | — | DONE (#370) |
| 8 | [012](012-notifications-keep-schedule-on-failed-gather.md) | A failed gather never replaces scheduled release notifications with nothing | bug | P2 | S | LOW | 011 (recommended) | DONE (#380, stacked on #370) |
| 9 | [017](017-settings-refresh-scoped.md) | Settings pull-to-refresh refreshes the home feed, not the whole cache | perf | P2 | S | LOW | — | DONE (#371) |
| 10 | [018](018-letterboxd-film-watch-invalidation-scoped.md) | A Letterboxd log refreshes only the logged film's watch state | perf | P2 | S | LOW | — | DONE (#373) |
| 11 | [015](015-harden-github-workflows.md) | Workflows pin actions and Bun; the release job keeps signing secrets narrow | security + dx | P2 | S | MED | — | DONE (#372; release dry run pending) |
| 12 | [016](016-web-security-headers.md) | The web app sends baseline security headers (no framing, nosniff, referrer, HSTS) | security | P2 | S | LOW | — | DONE (#381) |
| 13 | [013](013-session-changes-keep-cache-in-step.md) | Losing or gaining a session keeps the query cache in step | bug | P2 | M | MED | 006 | NEEDS REVISION (#386; active gathers can refetch the old provider set) |
| 14 | [014](014-log-retry-never-becomes-a-rewatch.md) | Retrying a failed provider never turns a landed write into a rewatch | bug (MED confidence) | P2 | S | LOW | 005 | NEEDS REVISION (#385; retry reconciliation reuses fresh pre-write cache) |
| 15 | [019](019-resolve-item-characterization-tests.md) | `useResolvedMediaItem` gets characterization tests | tests | P2 | M | LOW | — | DONE (#375) |
| 16 | [020](020-letterboxd-userscript-localhost-opt-in.md) | The Letterboxd userscript trusts localhost only after an explicit opt-in | security | P3 | S | LOW | — | DONE (#384) |
| 17 | [021](021-serializd-proxy-exact-get-paths.md) | The Serializd proxy forwards only the GET paths and query keys the app uses | security | P3 | S | MED | — | DONE (#387) |
| 18 | [022](022-trakt-log-invalidates-by-media-type.md) | A Trakt log refreshes the watched library for its own media type only | perf | P3 | S | LOW | 018 | DONE (#383, stacked on #373) |
| 19 | [024](024-write-result-type-in-provider-layer.md) | `ProviderWriteResult` lives in the provider layer | tech-debt | P3 | S | LOW | — | BLOCKED (STOP: `src/lib/media-sort.test.ts` already imports `@/features/watchlist/*`) |
| 20 | [026](026-up-next-calendar-key-test-clock.md) | The Up Next calendar-key test uses a fixed clock | tests (flake) | P3 | S | LOW | — | DONE (#376) |
| 21 | [027](027-agents-and-plan-md-drift.md) | AGENTS.md, plan.md and README stop steering agents toward banned patterns | docs | P3 | S | LOW | — | DONE (#388) |
| 22 | [025](025-ci-web-export-and-doctor.md) | CI checks the static web export and Expo doctor on every PR | dx | P3 | S | LOW | 015 | BLOCKED (STOP: `build:web` prerenders `studio/lookup/[name]` with a live TMDB fetch) |
| 23 | [023](023-effect-boundary-lint-rule.md) | A lint rule keeps Effect in its layers; Serializd connect stops importing it | tech-debt | P3 | M | LOW | — | DONE (#379) |
| 24 | [028](028-measure-persisted-snapshot-size.md) | Investigate: measure the persisted snapshot on web | perf (investigate) | P3 | S | LOW | — | BLOCKED (needs real connected accounts in a browser) |
| 25 | [029](029-spike-undo-a-log.md) | Direction spike: "undo this log" across providers | direction | — | S (feature L) | LOW | — | DONE (#389, `docs/plans/0115-undo-log.md`) |
| 26 | [030](030-spike-offline-durable-logs.md) | Direction spike: restart-safe offline logging (#208) | direction | — | S–M (feature L) | LOW | 005, 014 (recommended) | DONE (#390, `docs/plans/0116-offline-log-replay.md`) |

Direction spikes (029, 030) are options for the owner, not ranked against
bugs. Each produces a design doc in `docs/plans/`, never production code. The
owner's own next feature, pause/drop (#227, todo 020), is not duplicated here.
Plan 023 notes what a new feature write hook must do.

### Dependency notes (round 2)

- **Same function, land in order**: 005 → 014 (`planLogWrite`); 018 → 022 (`invalidateAfterLog`).
- **006 → 013**: 013 extracts the purge list that 006 extends with the diary root.
- **011 → 012**: 012 relies on an all-failed Trakt leg showing up in `errors`.
- **015 → 025**: both edit `ci.yml`; 025 copies 015's pinned setup steps.
- **023 and 027** both edit AGENTS.md in different paragraphs. Whichever lands second rebases.
- **008 and 027** both edit README.md in different sections.
- Everything else touches disjoint files and can run in parallel worktrees.
- All plans are JS, config or docs only. None needs `bun ios:clean` / `bun android:clean`.
  015 changes CI only, and 016 needs a web deploy to take effect.

### Verification baseline

`ci.yml` runs `bun lint`, `bun typecheck` and `bun run test` (which also covers
`worker/` and `oxlint-plugin-shinobu/` tests). During this audit `node_modules`
was absent and the advisor doesn't install, so those commands were **not run**.
Plan 0113 records them green at `dd6e6b9`. Every plan starts with
`bun install --frozen-lockfile`.

### Execution evidence (round 2)

Review update, 2026-11-01: plans 007, 013 and 014 remain open for the
correctness findings recorded in #382, #386 and #385. Their earlier green
unit tests did not cover those paths. These implementations follow their plans;
the findings identify gaps in those plans, not undocumented deviations. The two direction spikes remain design
proposals; a DONE spike does not authorize or implement its feature. DONE
means the linked PR completed implementation or its spike, not that it merged.

- Baseline at `01e42b3`: typecheck and lint exit 0, 1,571 tests pass. The
  `nitro-webview` git dependency was served from a local checkout of
  `275e918` because the sandbox blocks GitHub API tarballs. The lockfile is unchanged.
- Every code plan marked DONE below was reported to pass typecheck, lint and `bun run test`, and its new
  or changed tests were reported to fail with the fix reverted. This is
  implementation evidence, not a claim that every PR was merged or its runtime
  checks completed. Stacked PRs (013, 014, 012, 022)
  say so at the top and carry their dependency's commit until it merges.
- 024 stopped on its own condition before any edit:
  `grep -rn "from '@/features/" src/lib` also lists `src/lib/media-sort.test.ts`
  (imports from `@/features/watchlist/*`, present at `1003c59`).
- 025 stopped on its own condition: `bun run build:web` exits 1 after 160 s with
  `Failed to statically export route: studio/lookup/[name]` after a TMDB request
  (`ProviderNetworkError: tmdb: network error`). `expo-doctor` was not run.
- 028 needs connected tracker accounts in a browser. None were available.
- 007's step 0 (does AniList echo `state`) and its STOP condition could not be
  checked: the sandbox refuses `anilist.co`. The revision rejects a missing
  `state` while a flow is pending, so a web AniList connect fails closed if
  AniList doesn't echo it. Do one real web AniList connect before merging.
- 015's `release.yml` dry run needs a workflow dispatch. actionlint was not run.
- 016: the initial sandbox could not finish the export or run a browser pass.
  The 2026-11-01 review completed `build:web` using the existing local build
  environment, checked HTTP 200 and all five headers on `/` and
  `/letterboxd.user.js`, and rendered Home, Search, Settings and Inception
  details through local Wrangler in Chromium with no captured console entries.
- Browser or account checks in 013, 014, 017, 021 and 023 were skipped. Each PR says which.
- 030 skipped its browser offline pass. Its "today" section comes from code and a
  local TanStack script, with no network or account.
- 029's Trakt removal call is cited from a community client, because the official
  Trakt and Simkl docs were blocked. No removal endpoint was called.

## Round 1 (2026-10-26)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| [001](001-anilist-diary-pagination.md) | AniList diary keeps paginating past filtered entries | P1 | S | — | DONE |
| [002](002-anizip-transient-failures-not-cached.md) | Failed ani.zip lookups are retried, not cached as misses | P1 | S | — | DONE |
| [003](003-diary-poster-fallback-after-trakt.md) | Diary posters wait for Trakt art before a details read | P2 | S | — | DONE |
| [004](004-bottom-sheet-stable-release.md) | Bottom sheet off `0.17.0-next.2` to stable `0.17.1` | P2 | S + device QA | — | BLOCKED (code complete; full native checklist pending) |

### Execution evidence (round 1)

- 001 and 002 regressions failed against the baseline and pass with their fixes.
- 003 includes paused offline recovery. An installed TanStack QueryObserver
  check confirms the fallback waits through pause and reconnect, while a
  missing Trakt id still permits fallback.
- Combined TypeScript, lint, class-name and navigation checks pass, with 1,542
  isolated tests passing. Expo's dependency check and external-link check pass.
- Previously persisted ani.zip misses are not invalidated by this change.
- iOS clean rebuild and install pass with bottom sheet 0.17.1. The episode
  log sheet opens at content height with its confirm action visible. Scrim
  dismissal closes the form and keyboard while preserving the details route.
- iOS card long-press automation navigated instead of opening actions, and
  the rapid-cycle attempt drifted navigation. Card actions, long-tag scrolling
  and ten verified cycles remain unverified. No provider writes were made.
- Android clean prebuild and Gradle compilation pass, producing the debug
  APK. The full clean command exits 1 when Expo's emulator-property query
  times out before installation, leaving Android runtime QA blocked.
- `bun run build:web` exits 0 and exports `dist`. Browser interactions and
  live Trakt poster-request sequencing remain unverified.

### Dependency notes (round 1)

- The plans touch disjoint files and can run in parallel worktrees.
- 004 needs native rebuilds (`bun ios:clean`, `bun android:clean`) and device
  QA. 001–003 are JS-only and hot reload.

## Audit scope rules (owner decisions, 2026-10-26)

- Native code is never audited: `android/`, `ios/`, config plugins, native modules.
- Dev screens and spike code that the app doesn't use are out of scope
  (`src/app/dev/*`, `worker/letterboxd-write-spike.ts`).

### Not audited in round 2

- The `react-native-enriched-markdown` web renderer (needs `node_modules`).
  Markdown input is already reduced to AniList staff descriptions with HTML stripped.
- `bun audit` was not re-run. Round 1 found only tooling advisories.
- Runtime behaviour on devices or in browsers. All findings are from reading code.

## Round 1 "not yet planned" list, reconciled

All but one are now planned or settled:

- AniList web OAuth return with no `state`; Trakt `state` not compared → **007**
- Disconnect doesn't purge the persisted diary → **006**
- Userscript trusts localhost dev ports → **020**
- Web Trakt reconnect from "connected but unusable" discards the code → **007**
- Coalesced Simkl batch gives every waiter one result → **009** (the unbuildable-entry case; partial `not_found` remains, below)
- Simkl/Letterboxd always "doesn't have it" → **005** for Simkl. The Letterboxd half is wrong: it has a real branch.
- Connecting a provider doesn't refresh Up Next or the watchlist → **013** (lag is up to 15 min, not "until restart")
- No tests for `useResolvedMediaItem` → **019**
- `effect` imported outside its layers with no lint rule → **023**
- No CSP or `frame-ancestors` → **016** (baseline headers; full CSP below)
- `release.yml` passes every secret into one step → **015**

## Findings not yet planned (round 2)

Verified but not planned this round. Plan them with `/improve plan <finding>`.

- **Full CSP for web** (`script-src` with hashes for `src/app/+html.tsx` inline
  scripts, plus `connect-src`/`img-src` allowlists). This would limit token
  theft by injected script. It needs a per-screen browser pass. See plan 016's maintenance notes.
- **Rate limit on the Serializd `/login` relay** (`worker/serializd-proxy.ts`).
  It is an open credential relay from Cloudflare egress. Needs a Workers
  rate-limit binding in `wrangler.jsonc`, which is an owner decision.
- **Simkl partial `not_found` attribution**: a coalesced batch still shares
  "could not match 1 of 2" across waiters (plan 009's maintenance notes).
- **Notifications on a partial provider failure** drop the failed provider's
  alerts until the next good refresh (plan 012's maintenance notes; R4 trade-off).
- **Catch-up sheet settle signal has no tests**
  (`src/features/log-media/session/catch-up-log-sheet.tsx` `fire`). Extract the
  "await Up Next refetch?" decision into a pure helper next to `resolveQuickLog` and test that.
- **Split `use-log-media.ts` (987 lines)** into adapters / plan / reconcile reads /
  invalidation. Real cost (every log test mocks the whole write graph), but it is
  a refactor without a bug, and plans 005, 009, 014, 018 and 022 touch the file first.
- **Lint rule: `src/lib/**` may not import `@/features/*`** (keeps plan 024 fixed).
- **Shared verb plumbing before pause/drop (#227)**: `use-watchlist-media.ts:~103-158`
  and `use-unwatchlist-media.ts:~139-193` duplicate the mutation-key, pending-guard
  and latest-result code. Extract it before a third verb copies it.
- **AniList clears its token on any `ProviderAuthError`** (`anilist/http.ts:~228`).
  That is a silent disconnect. Plan 013 makes it purge caches correctly, but
  whether it should clear at all is a product question.
- `docs/solutions/trakt-oauth-setup.md` points at a removed file path. Plan 007 step 5 fixes it.

## Findings considered and rejected

Round 1 (still valid):

- **AniList airing-schedule pagination ("~40 sequential requests")**: overstated.
  A live probe on 2026-10-26 showed AniList keeps schedules only for recent
  years: One Piece has 67 rows (3 pages), Detective Conan 156 rows (7 pages),
  and seasonal shows fit in page 1. Plan 0080 added the multi-page read on
  purpose. Not worth a plan. Revisit only if 429s trace to `completeAiringSchedule`.
- **nitro-webview git pin**: still required. Upstream PR #53 merged after the
  last release (0.2.2). Re-check when a newer version is published.
- **Unused dependencies**: none. Everything flagged (`cn`, `torph`, `sonner`,
  `sonner-native`, `react-hook-form`, `@hookform/resolvers`, `@expo/ui`) is imported.
- **`bun audit` advisories**: all in tooling (expo-cli, react-devtools-core,
  wrangler/miniflare, metro). None reach runtime code.
- **`plan.md` "bundled Simkl client id"**: accurate. Release builds inject it from repo secrets.
- **Letterboxd write spike in the Worker, `/dev/letterboxd-watchlist-spike` route**: out of scope by owner decision.

Round 2:

- **Diary invalidation after a log with `refetchType: 'none'`** (to avoid
  refetching every loaded diary page). Rejected: nothing refetches a tab on
  focus (no `useFocusEffect` or `focusManager` wiring), and native tabs stay
  mounted, so the diary would stay stale. That is the "Logged — refresh to
  update" class in `docs/solutions/quick-log-settle-refresh-to-update.md`.
  Revisit only with a focus-refetch mechanism.
- **Native MMKV encryption, plaintext web `localStorage`**: settled in todos/003. Only the README claim was wrong (plan 008).
- **Simkl OAuth**: PKCE plus a persisted `state` with mismatch rejection. Fine.
- **OAuth params in history**: code, state, error, marker and fragment are all stripped before the exchange. Fine.
- **Token logging, query-key secrets**: no token is logged or used in a key. Fine.
- **Letterboxd and 4chan proxies**: strict regexes, GET only, CSP plus nosniff. Fine. The Serializd proxy's plain `../` cases are resolved by the URL parser before the rules run (documented in its test). Only the encoded form mattered (plan 021).
- **Native WebView scripts and the sign-in WebView**: request data is embedded through `JSON.stringify`, with origin checks. Fine.
- **`dangerouslySetInnerHTML`**: static content in `+html.tsx` only. No `eval`, `new Function` or `innerHTML` in `src/`.
- **Air-time comparisons outside `has-aired.ts`** (`up-next/compute.ts` premiere window, `watchlist-media/invalidate.ts`, `compute-schedule.ts`): window checks; the "has aired" decision still goes through `hasAired`.
- **Notification dedupe and timezone handling**: correct (airing-key dedupe, local-day batching, `parseLocalInstant`).
- **Persist codec and buster**: the `Set`/`Map` codec covers the persisted shapes, and there has been no shape change since v7.
- **HTTP retries on writes and 429 handling**: no transport-level retry. Trakt retries only unprocessed requests. Simkl and AniList follow their documented solutions.
- **Diary merge watermark**: correct.
- **`routing.ts` with an empty `providers` override**: the confirm sheet blocks an empty selection.
- **ScrollView plus `map`, hex literals, `provider === '…'` in `features/lists`, `isLoading` in details/episode**: static or windowed data, commented composed colours, copy selection, and the non-suspending resolver path respectively. None are violations.
- **`effect` imports in `state/queries/*`**: sanctioned by AGENTS.md. Only the two Serializd components were violations (plan 023).
- **Dependencies**: SDK 58 aligned. `.env.template` lists all four `EXPO_PUBLIC_*` vars.
- **Duplicate `docs/plans` numbers (0044, 0074)**: only referenced by full filename. Harmless.
- **`pr-labels.yml`**: the PR title goes through `env:`, and no workflow uses `pull_request_target`. Fine.
