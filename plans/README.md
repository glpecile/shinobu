# Implementation Plans

Handoff plans written by the `improve` skill for executor agents. Product plans
stay in `docs/plans/`. Each executor: read the plan fully before starting,
honor its STOP conditions, and update your row when done.

- Round 1: 2026-10-26 against commit `04cc56e` (plans 001–004).
- Round 2: 2026-10-31 against commit `1003c59` (plans 005–030), a full audit
  covering correctness, security, performance, tests, tech debt, DX, docs and direction.
- Round 3: 2026-11-02 against commit `1994ac9` (plan 031), a device-profiled
  performance review of the five slowest spots.
- Round 4: 2026-11-12 against commit `04643c8` (plans 032–039), a focused audit
  of log routing and identity matching. See the section at the end of this file.

Status values: TODO | IN PROGRESS | DONE | NEEDS REVISION (review finding) | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Round 2: ranked index (2026-10-31)

Ranked by leverage: severity × confidence ÷ effort, with security and
unblocking work floated up. Work top to bottom unless a dependency says otherwise.

| Rank | Plan                                                        | Title                                                                                                               | Category              | Priority | Effort          | Risk | Depends on             | Status                                                                                |
| ---: | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- | --------------- | ---- | ---------------------- | ------------------------------------------------------------------------------------- |
|    1 | [005](005-simkl-reconcile-blocks-rewatches.md)              | A provider whose watch state can't be read no longer blocks rewatches elsewhere                                     | bug                   | P1       | S               | LOW  | —                      | DONE (#369)                                                                           |
|    2 | [006](006-disconnect-purges-diary.md)                       | Disconnecting a provider also drops the cached unified diary                                                        | bug / privacy         | P1       | S               | LOW  | —                      | DONE (#368)                                                                           |
|    3 | [008](008-readme-token-encryption-claim.md)                 | The README stops claiming tokens are encrypted                                                                      | docs (security claim) | P1       | S               | LOW  | —                      | DONE (#378)                                                                           |
|    4 | [009](009-simkl-unbuildable-entry-skips-alone.md)           | An unbuildable Simkl log is skipped on its own, never coalesced into a batch's `ok`                                 | bug                   | P1       | S               | LOW  | —                      | DONE (#374)                                                                           |
|    5 | [007](007-web-oauth-returns-need-a-pending-flow.md)         | Web OAuth returns only complete a connect this browser started (AniList login CSRF, Trakt `state`, Trakt reconnect) | security + bug        | P1       | M               | MED  | —                      | DONE (#382; AniList `state` echo confirmed 2026-11-01)                                |
|    6 | [010](010-mapping-lookups-dont-cache-transient-failures.md) | Identity and title lookups stop caching a network failure as "no match"                                             | bug                   | P2       | S–M             | LOW  | —                      | DONE (#377)                                                                           |
|    7 | [011](011-trakt-continue-watching-reports-total-failure.md) | Trakt Continue Watching reports an error when every progress call fails                                             | bug                   | P2       | S               | LOW  | —                      | DONE (#370)                                                                           |
|    8 | [012](012-notifications-keep-schedule-on-failed-gather.md)  | A failed gather never replaces scheduled release notifications with nothing                                         | bug                   | P2       | S               | LOW  | 011 (recommended)      | DONE (#380, stacked on #370)                                                          |
|    9 | [017](017-settings-refresh-scoped.md)                       | Settings pull-to-refresh refreshes the home feed, not the whole cache                                               | perf                  | P2       | S               | LOW  | —                      | DONE (#371)                                                                           |
|   10 | [018](018-letterboxd-film-watch-invalidation-scoped.md)     | A Letterboxd log refreshes only the logged film's watch state                                                       | perf                  | P2       | S               | LOW  | —                      | DONE (#373)                                                                           |
|   11 | [015](015-harden-github-workflows.md)                       | Workflows pin actions and Bun; the release job keeps signing secrets narrow                                         | security + dx         | P2       | S               | MED  | —                      | DONE (#372; release dry run pending)                                                  |
|   12 | [016](016-web-security-headers.md)                          | The web app sends baseline security headers (no framing, nosniff, referrer, HSTS)                                   | security              | P2       | S               | LOW  | —                      | DONE (#381)                                                                           |
|   13 | [013](013-session-changes-keep-cache-in-step.md)            | Losing or gaining a session keeps the query cache in step                                                           | bug                   | P2       | M               | MED  | 006                    | DONE (#386; gathers read the usable providers when each fetch starts)                 |
|   14 | [014](014-log-retry-never-becomes-a-rewatch.md)             | Retrying a failed provider never turns a landed write into a rewatch                                                | bug (MED confidence)  | P2       | S               | LOW  | 005                    | DONE (#385; retries refetch watch state and don't resend an unreadable target)        |
|   15 | [019](019-resolve-item-characterization-tests.md)           | `useResolvedMediaItem` gets characterization tests                                                                  | tests                 | P2       | M               | LOW  | —                      | DONE (#375)                                                                           |
|   16 | [020](020-letterboxd-userscript-localhost-opt-in.md)        | The Letterboxd userscript trusts localhost only after an explicit opt-in                                            | security              | P3       | S               | LOW  | —                      | DONE (#384)                                                                           |
|   17 | [021](021-serializd-proxy-exact-get-paths.md)               | The Serializd proxy forwards only the GET paths and query keys the app uses                                         | security              | P3       | S               | MED  | —                      | DONE (#387)                                                                           |
|   18 | [022](022-trakt-log-invalidates-by-media-type.md)           | A Trakt log refreshes the watched library for its own media type only                                               | perf                  | P3       | S               | LOW  | 018                    | DONE (#383, stacked on #373)                                                          |
|   19 | [024](024-write-result-type-in-provider-layer.md)           | `ProviderWriteResult` lives in the provider layer                                                                   | tech-debt             | P3       | S               | LOW  | —                      | BLOCKED (STOP: `src/lib/media-sort.test.ts` already imports `@/features/watchlist/*`) |
|   20 | [026](026-up-next-calendar-key-test-clock.md)               | The Up Next calendar-key test uses a fixed clock                                                                    | tests (flake)         | P3       | S               | LOW  | —                      | DONE (#376)                                                                           |
|   21 | [027](027-agents-and-plan-md-drift.md)                      | AGENTS.md, plan.md and README stop steering agents toward banned patterns                                           | docs                  | P3       | S               | LOW  | —                      | DONE (#388)                                                                           |
|   22 | [025](025-ci-web-export-and-doctor.md)                      | CI checks the static web export and Expo doctor on every PR                                                         | dx                    | P3       | S               | LOW  | 015                    | BLOCKED (STOP: `build:web` prerenders `studio/lookup/[name]` with a live TMDB fetch)  |
|   23 | [023](023-effect-boundary-lint-rule.md)                     | A lint rule keeps Effect in its layers; Serializd connect stops importing it                                        | tech-debt             | P3       | M               | LOW  | —                      | DONE (#379)                                                                           |
|   24 | [028](028-measure-persisted-snapshot-size.md)               | Investigate: measure the persisted snapshot on web                                                                  | perf (investigate)    | P3       | S               | LOW  | —                      | BLOCKED (needs real connected accounts in a browser)                                  |
|   25 | [029](029-spike-undo-a-log.md)                              | Direction spike: "undo this log" across providers                                                                   | direction             | —        | S (feature L)   | LOW  | —                      | DONE (#389, `docs/plans/0115-undo-log.md`)                                            |
|   26 | [030](030-spike-offline-durable-logs.md)                    | Direction spike: restart-safe offline logging (#208)                                                                | direction             | —        | S–M (feature L) | LOW  | 005, 014 (recommended) | DONE (#390, `docs/plans/0116-offline-log-replay.md`)                                  |

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

Review update, 2026-11-01: plans 013 and 014 were revised and shipped in
#386 and #385 for the correctness findings recorded there. Plan 007's revision
is pushed to #382, which stays open until one real web AniList connect
confirms the `state` echo. Their earlier green unit tests did not cover those paths. These implementations follow their plans;
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
- 007's step 0 was confirmed on 2026-11-01 with a real AniList authorize in
  Chrome: the redirect fragment carries `access_token`, `token_type`,
  `expires_in` and the echoed `state`.
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

| Plan                                               | Title                                                    | Priority | Effort        | Depends on | Status                                                 |
| -------------------------------------------------- | -------------------------------------------------------- | -------- | ------------- | ---------- | ------------------------------------------------------ |
| [001](001-anilist-diary-pagination.md)             | AniList diary keeps paginating past filtered entries     | P1       | S             | —          | DONE                                                   |
| [002](002-anizip-transient-failures-not-cached.md) | Failed ani.zip lookups are retried, not cached as misses | P1       | S             | —          | DONE                                                   |
| [003](003-diary-poster-fallback-after-trakt.md)    | Diary posters wait for Trakt art before a details read   | P2       | S             | —          | DONE                                                   |
| [004](004-bottom-sheet-stable-release.md)          | Bottom sheet off `0.17.0-next.2` to stable `0.17.1`      | P2       | S + device QA | —          | BLOCKED (code complete; full native checklist pending) |

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

## Round 3: performance review (2026-11-02)

| Plan                                     | Title                                        | Category | Priority | Effort | Risk | Status                                                                             |
| ---------------------------------------- | -------------------------------------------- | -------- | -------- | ------ | ---- | ---------------------------------------------------------------------------------- |
| [031](031-performance-review-2026-11.md) | The five slowest spots from a device profile | perf     | P3       | S      | LOW  | IN PROGRESS (diary leaves and the compiler lint done in #411; follow-ups A–B open) |

## Round 4: log routing and identity matching (2026-11-12)

Owner request: find the edge cases where a log misses a provider or reaches
the wrong title, such as an AniList film that never logs to Letterboxd. The
owner chose every finding. Work top to bottom unless a dependency says otherwise.

| Rank | Plan                                                            | Title                                                                              | Category          | Priority | Effort | Risk | Depends on                           | Status                          |
| ---: | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- | -------- | ------ | ---- | ------------------------------------ | ------------------------------- |
|    1 | [032](032-movie-never-takes-a-tv-anime-anilist-id.md)           | A movie never takes a TV anime's AniList id from ani.zip                           | bug (wrong write) | P1       | S      | LOW  | —                                    | DONE (PR #441)                  |
|    2 | [033](033-late-log-targets-start-selected.md)                   | A log target that appears after the sheet opens starts selected                    | bug               | P1       | S      | LOW  | —                                    | DONE (PR #440)                  |
|    3 | [034](034-anime-takes-a-tmdb-id-of-its-own-kind.md)             | An AniList anime takes a TMDB id only when the id is of its own kind               | bug (wrong write) | P1       | M      | MED  | 032                                  | DONE (PR #441)                  |
|    4 | [035](035-anilist-unplaced-season-is-a-reasoned-skip.md)        | A later-season log that finds no AniList entry reports a reasoned AniList skip     | bug               | P2       | S      | LOW  | —                                    | DONE (PR #439)                  |
|    5 | [036](036-unmapped-anizip-records-refresh.md)                   | An ani.zip record with no bridge ids is asked again after a day                    | bug               | P2       | S      | LOW  | —                                    | DONE (PR #439)                  |
|    6 | [038](038-one-episode-anime-filed-as-a-movie-logs-as-a-film.md) | A one-episode anime that TMDB files as a movie logs as a film                      | feature           | P2       | M      | MED  | 034                                  | DONE (PR #441)                  |
|    7 | [037](037-letterboxd-film-takes-its-tmdb-id-from-its-page.md)   | A Letterboxd film with only a slug takes its TMDB id from its film page            | bug               | P3       | S      | LOW  | — (after 032, 034 to avoid a rebase) | DONE (PR #442, stacked on #441) |
|    8 | [039](039-unmatched-provider-gets-a-manual-row.md)              | A connected provider with no match for an anime gets a manual row in the log sheet | bug (no dead end) | P3       | M      | LOW  | 034, 038 (recommended)               | DONE (PR #440)                  |

### The shared root cause (plans 032, 034, 038)

ani.zip serves the anime-lists dataset and flattens its TMDB id. The dataset
knows the kind (`{"tv": N}` or `{"movie": [N]}`); ani.zip returns one number.
TMDB movie and TV ids share a number space. Counted on 2026-11-12, for entries
with an AniList id and a TMDB id:

| ani.zip record      | TMDB id is a TV id | TMDB id is a movie id |
| ------------------- | -----------------: | --------------------: |
| has `thetvdb_id`    |              6,953 |                   253 |
| has no `thetvdb_id` |                  8 |                 1,066 |

`mappings.type` does not tell the kind: 675 `MOVIE` records carry a TV id.
Plan 032 adds the rule as `aniZipTmdbKind`; 034 and 038 build on it.

### Dependency notes (round 4)

- **032 → 034 → 038**: same block of `enrich.ts`, and 034 needs the helper 032 adds.
- **032, 034, 037, 038** all edit `enrich.ts` and `enrich.test.ts`. Run them in
  series, not in parallel worktrees.
- **035 and 038** both edit `resolveLogPlan` in `use-log-media.ts`, in different
  lines. Whichever lands second rebases.
- **033 and 039** both edit the two log sheets. 033 changes the selection
  state; 039 adds a prop. Whichever lands second rebases.
- **036** touches only `mapping.ts` and its test. 032 changes one other line there.
- All eight plans are JS only and hot reload. None needs `bun ios:clean` or `bun android:clean`.

### Verification baseline (round 4)

`node_modules` was present. The advisor did not run `bun typecheck`, `bun lint`
or `bun run test` this round; every plan starts from those gates. Findings come
from reading code, from live `api.ani.zip` probes, and from the public
anime-lists dataset. No provider write was made and no account was used.

### Not audited in round 4

- The watchlist verbs, manga logs, Serializd season resolution, the sheet
  components beyond their target and selection state, and the native WebView scripts.
- What Letterboxd answers for a `/tmdb/{id}/` path whose id is a TV id.
  Cloudflare blocks an unauthenticated probe. Plan 034 does not depend on the answer.
- Runtime behaviour on a device. Plans 033, 038 and 039 carry an optional device check.

### Findings not yet planned (round 4)

- **`imdb` ids from ani.zip on a film tied to a TVDB show** may be the show's.
  Plan 034 keeps adopting them. Trakt then answers "not found", never a wrong
  title. Revisit only if such errors are reported.
- **Letterboxd by IMDb id**: a film with an IMDb id and no TMDB id or slug is
  routed to Letterboxd and fails there. Letterboxd may redirect `/imdb/{id}/`
  like `/tmdb/{id}/`; that needs a spike first.
- **A TMDB anime with no AniList match** shows no AniList row. Left out of
  plan 039 on purpose: every western animated film would show it.

### Considered and rejected (round 4)

- **`pickAnimeFilmMatch` accepts the top exact-year AniList film when no title
  matches**, so a live-action film could take an anime's id. Probed on
  2026-11-12 with 12 live-action titles from 2023–2025: no same-year result
  for any. The rule is documented (plan 0024 KTD3). Not worth a plan.
- **A title match for an unmapped anime series** (to reach Trakt and Serializd):
  the code records the decision not to, because a wrong show would get writes
  with no episode table.
- **Simkl reconcile always answers "unknown"**: documented and deferred in plan 0034.
- **A film with no year takes the top text-search hit**: documented in
  `pick-movie-match.ts`; plan 037 removes the Letterboxd case of it.
- **`useLogTargetsSplit`'s query key uses only `item.id`**: the default 60 s
  stale time bounds it, and the mutation re-runs the enrichment.

## Round 5: PERF.md checked against the code (2026-11-19)

Owner request: check `PERF.md` against the codebase and hand the fixes to
executor agents in the same run. Written against commit `9f1b1b1`. Four
read-only auditors covered every `PERF.md` section, and the advisor opened
each cited file before a finding counted. Five findings were confirmed in
code, small, and checkable without a device. All five shipped in #478, one
commit each, so they have no plan file.

| Fix                                                                               | `PERF.md` section |
| --------------------------------------------------------------------------------- | ----------------- |
| The Simkl library is indexed once per snapshot, not once per lookup               | Lists             |
| Home pull-to-refresh stops downloading list indexes that no screen shows          | Invalidation      |
| Three detail reads set `gcTime` equal to `staleTime`                              | Requests          |
| The shared list row and the credit timeline row prefetch details on press         | Prefetch          |
| A discussion catalog is normalized once when it is fetched (plan 031 follow-up A) | Data layout       |

Evidence: typecheck and lint exit 0 and 1,766 tests pass on the PR branch.
The Simkl test failed before its fix. On a Pixel 8 Pro dev build, Home pull
to refresh, a watchlist list-view row, and a credit timeline row worked.
Nothing was timed, and nothing ran in a browser. Each fix claims less work, not
more speed.

### Findings not yet planned (round 5)

Confirmed in code, but each needs a measurement, a device, or an owner
decision before a plan is honest.

- **A failed refetch drops a good entry from the snapshot.**
  `shouldPersistQuery` (`state/queries/persist.ts`) writes only
  `status === 'success'`. A refetch that fails keeps its data but has status
  `error`, and no `onlineManager` is wired, so an offline launch rewrites the
  snapshot without those keys. The next launch loses the instant Home. The
  simple fix (persist when `data !== undefined`) restores queries in the error
  state, which changes what a cold start shows. Needs a design.
- **A snapshot written during an Up Next or watchlist refetch omits them.**
  The streaming guard in `shouldPersistQuery` also excludes the complete value
  held during a `refetchMode: 'replace'` refetch. A kill in that window gives
  a cold start with skeletons. Needs a way to tell a cold stream from a refetch.
- **`['mapping', 'anizip-episodes']` is on the allowlist, but its query sets
  `gcTime` to 1 h**, which overrides the 24 h default from
  `retainPersistedQueries`. Either the allowlist entry or the 1 h is wrong.
  Owner decision: the document is about 1 MB.
- **Per-item persisted entries never age out for a daily user**: hydration
  restarts each query's 24 h GC timer. An age cut in `shouldPersistQuery`
  would also evict the forever-cached mappings and the AniList viewer, which
  slows cold start. Measure the snapshot first (plan 028).
- **Trakt watched libraries are on the web allowlist** and grow with the
  user's history. Plan 028 (measure the web snapshot) decides this.
- **JS-thread scroll handlers**: `components/rail.tsx` `useRailFade`
  (`setAtEnd` on every scroll event, every rail), `features/diary/diary-list.tsx`
  `handleScroll`, `features/credit-timeline/credit-timeline.tsx` `onScroll`.
  #301 fixed the same pattern on Details. Needs device QA on three platforms.
- **Rows rebuilt on every owner render**: `app/(tabs)/search.tsx` (`sections`
  built from tracked query results, new on each keystroke),
  `features/lists/hardcover-list-detail.tsx` (`data` and `renderItem` in JSX
  that captures `query`), `features/anime-seasons/season-list.tsx` and
  `credit-timeline.tsx` (`useProgressLibraries` returns a new object each
  render because it holds tracked results). The auditor read React Compiler's
  output; confirm with the React profiler before planning.
- **`localeCompare` with options inside sort comparators** (`lib/media-sort.ts`)
  and `toLocaleString` per day in `features/diary/merge.ts` `summarizeDay`.
  Hermes may build a collator per call. Time it with `debugger-evaluate` first.
- **`PosterStack` keys slots by film id inside a recycled grid**
  (`features/lists/poster-stack.tsx`), so a recycled card remounts five
  images; `ListCard` never resets its web hover state.
- **Cached list pages are flattened to find one item**
  (`state/queries/letterboxd.ts` and `serializd.ts` cache finders). Once per
  details open; low.
- **Press sites without a prefetch** that #478 leaves out:
  `hardcover-list-detail.tsx`, `serializd-list-detail.tsx`,
  `app/(tabs)/diary.tsx`, `detail-variants-section.tsx`,
  `card-actions-sheet.tsx`, `episode-sections.tsx`.
- **Letterboxd list films and the Reddit search keep the default 5-minute
  `gcTime`** under a 15- and 10-minute `staleTime`. Both set
  `retryOnMount: false`, so a longer `gcTime` also keeps a failed read longer.
- **List edits**: a Serializd membership edit writes the confirmed list into
  the cache and then refetches it; a Serializd or Letterboxd rename writes the
  cache without `cancelQueries` (`state/queries/list-membership.ts`).
- **Trakt sync pages load one after another** (`lib/providers/trakt/reads.ts`
  `getPagedSync`). Parallel pages need the page-count header exposed and a
  check against Trakt's rate limit.
- **Up Next regathers after a manga log or a book watchlist write**, which it
  never reads. The invalidation is also the quick-log settle signal, so check
  that first.
- **List create enriches up to 50 items with an unbounded `Promise.all`**
  (`state/queries/list-membership.ts`).
- **`PERSISTED_PREFIXES`' comment** (`state/queries/persist.ts`) says
  "Everything here is on the home screen's critical path". The list now also
  holds the Diary feed and the per-film Letterboxd reads.

### Considered and rejected (round 5)

- **The per-film Letterboxd read drops its tracing span**: it is a query's
  top-level read, and the page it downloads dwarfs the cost of one span. #478
  shipped this change and then reverted it.
- **Details pull-to-refresh narrows the Trakt library to the item's type**:
  #330 already narrowed this list on purpose and kept both Trakt keys, and
  `type: 'active'` bounds the cost. The advisor did not prove that nothing on
  a film's page reads the shows library, so the saving is not worth the risk.
- **`useTraktItemQuery` `gcTime`**: its `staleTime` is infinite; an infinite
  `gcTime` never frees memory.
- **`ListSheet` mounts on Home without `useBootRevealed`**: its content is
  null while closed. No evidence of cost.
- **Up Next comparators parse dates per comparison**: tens of entries.
- **Letterboxd parsers build a `RegExp` per attribute**: dwarfed by the fetch.
- **Web disclosures and sheets animate height**: one-off, not per row.
- **TMDB season batches past 20 run in series**: only for shows with more
  than 40 seasons.
- **`WatchedMark` and `RailLine` animate when a recycled cell changes item**:
  visual only; no CPU evidence.
- **Calendar and Details fetch one TMDB movie under two keys**: the result
  shapes were not shown to be shareable.
- **The Letterboxd watch read runs for films another provider already marks
  complete**: #423 and #433 tuned this path, and the list counter may need
  every film.

### Not audited in round 5

- Native code, `src/app/dev/*`, `worker/`.
- Every historical number in `PERF.md` that comes from a PR body or a device
  (module counts, font sizes, write cost, build times). Only #423 was read.
- Runtime behaviour. No profiler, no device, no browser. All findings are
  from reading code and, for React Compiler claims, its compiled output.

## Round 6: performance audit (2026-11-26)

Owner request: a performance audit, with the fixes handed to `codex` and
shipped by `agy`. Written against commit `6f8c3aad`. Four read-only auditors
covered requests and invalidation, lists and render cost, cold start and
bundle, and CPU loops and Effect. They weighted the code written since round
5 (the offline log queue, pause and drop, reading, list forms). The advisor
opened each cited file before a finding counted. No device, profiler or
browser was used. Each plan claims less work, not more speed.

Selection rule: confirmed in code, small, and checkable without a device. The
owner was not asked to choose; the top seven by leverage were planned.

| Plan                                                         | Title                                                              | `PERF.md` section | Priority | Effort | Risk | Status |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------- | -------- | ------ | ---- | ------ |
| [040](040-diary-feed-derives-once-per-data-change.md)        | The diary feed derives its days once per data change               | Data layout       | P2       | S      | LOW  | DONE (review passed; PR pending) |
| [041](041-web-hashed-assets-cache-immutable.md)              | Hashed web assets are cached as immutable                          | Cold start        | P2       | S      | LOW  | DONE (review passed; PR pending) |
| [042](042-simkl-diary-parses-each-instant-once.md)           | The Simkl diary projection parses each instant once                | Data layout       | P3       | S      | LOW  | DONE (review passed; PR pending) |
| [043](043-simkl-calendar-grouped-once-per-gather.md)         | Up Next groups the Simkl calendar by show once per gather          | Data layout       | P3       | S      | LOW  | DONE (review passed; PR pending) |
| [044](044-book-log-refreshes-only-lists-with-the-book.md)    | A book log refreshes only the Hardcover lists that hold the book   | Invalidation      | P3       | S      | LOW  | DONE (review passed; PR pending) |
| [045](045-library-indexes-built-once-per-snapshot.md)        | Watched-library indexes are built once per snapshot                | Lists             | P3       | S      | LOW  | DONE (review passed; PR pending) |
| [046](046-watchlist-membership-indexes-inputs-once.md)       | Watchlist membership indexes the gathered inputs once per snapshot | Data layout       | P3       | S      | LOW  | DONE (review passed; PR pending) |

The plans touch different files and have no dependencies. They ship as one
branch (`perf/round-6`), one commit each. `codex` executed all seven. The
advisor read each diff against its plan and re-ran the gates: typecheck and
lint exit 0, 1,812 tests pass, and the plan 040 compile check prints
`MEMOIZED`. Plan 040 was revised once during execution: the time zone read
blocked the compiler memo, so it now goes through `useDeviceTimeZone`.

### Findings not yet planned (round 6)

Confirmed in code, but each needs a device, a design, or an owner decision.

- **A pending-log replay invalidates once per queued log.**
  `features/log-media/pending-log-replayer.tsx` `drain` sends each record
  through `useLogMedia`, and each runs `invalidateAfterLog` in full. Five
  queued episodes cause five rounds of library, diary, Up Next and watchlist
  refetches, and each round cancels the last. A replay also reads each
  provider's state fresh per record (`'strict'` reads). Batching both per
  drain is M effort and touches the reconcile path that decides skip versus
  log. Needs a design, not an S plan.
- **A Serializd log always re-reads the Paused and Dropped lists and
  invalidates all three status lists and Coming Soon**
  (`serializd/writes.ts` → `resumeOnSerializd`, `use-log-media.ts`
  Serializd branch). Gating the invalidation on "the show moved" needs the
  write result to carry that fact. It is unknown whether the server changes
  Currently Watching on a log (`docs/solutions/tracking-status-provider-support.md`).
- **A Simkl or Serializd pause or drop downloads its status source twice**
  (`features/tracking-status/use-tracking-status.ts` reads outside the shared
  query key, then invalidates it). Rare action, low cost.
- **A Hardcover- or Serializd-only pause or drop regathers Up Next**, which
  reads neither provider (`features/watchlist-media/invalidate.ts`). Same
  family as the round 5 item about manga logs.
- **Closed native sheets keep their content mounted**
  (`components/sheet/index.tsx` does not pass `lazy`). A closed card-actions
  sheet keeps about 10 query observers per host screen, and every log
  refetches the film-plays read of the last item each sheet showed. `lazy`
  changes mount timing and resets sheet state on reopen. Needs device QA.
- **The progress scrubber re-renders `LogConfirmForm` on every touch move**
  (`features/log-media/progress-scrubber.tsx`, `reading-progress-field.tsx`
  `setPage` returns a new object even when the page did not change). M effort
  and a visible behaviour to check on a device.
- **`serializd-list-detail.tsx` rebuilds its rows on every owner render**
  (the derivation sits between hooks; `letterboxd-list-detail.tsx` already
  fixed this by calling the hooks first). `new-list-form.tsx` watches `items`
  together with `name`, so each keystroke re-renders the picked rows. Both
  can use the compile check from plan 040.
- **Two episode push sites skip the TMDB episode prefetch**
  (`anime-seasons-section.tsx`, `episode-actions-sheet.tsx`). Not confirmed
  that the anime episode screen resolves the same TMDB id.
- **zod ships 60 unused locales in the web `__common` chunk** (about 93 KB
  gzip for all of zod, 39 KB of it locales; 8 small form schemas use it).
  Effect Schema is already bundled and `@hookform/resolvers/standard-schema`
  is installed. M effort, and validation messages must be checked per form.
- **The web boot splash waits on Inter Italic** (106 KB, 30 % of the preloaded
  fonts), which only markdown `em` uses. Removing it from the preload shows a
  fallback italic for a moment. Owner decision.
- **Two oversized images**: `public/splash-icon.png` is 1024 px for a 200 px
  mark (77 KB), and the "Orion" icon preview in Settings requires the 1.7 MB
  icon source. Both need a new image asset.
- **Unhashed `/fonts/*` and the splash image are served with `max-age=0`.**
  Plan 041 covers only hashed files. A lifetime for unhashed files is an
  owner decision.
- **Native fonts load at runtime before the first render** (`useFonts` gates
  `appReady`). Embedding them through the `expo-font` plugin needs a Perfetto
  timing first, and it is a native change.
- **`nextDiaryCursor` runs on every Diary render** through
  `getNextPageParam`. Plan 040 leaves it.
- **`entryNumberFor` scans the whole ani.zip map per episode**
  (`lib/providers/mapping/episode-translation.ts`). Only long-runner batch
  logs pay for it.

### Considered and rejected (round 6)

- **Effect usage**: all 20 `Effect.fn("…")` sites are top-level reads or
  writes, every `forEach`/`all` over a collection has a numeric
  `concurrency`, and there is no layer, retry or schedule in `src/`. Nothing
  to fix.
- **CI caching**: a CI run takes about 28 s and `bun install` takes 4 s.
- **Effect barrel imports, `export *` barrels on the launch path**: none.
- **`PendingLogReplayer` at root mount**: one MMKV read when the queue is
  empty.
- **The Ionicons glyph map on web**: about 8 KB gzip.
- **`tag-picker.tsx` re-renders 24 chips per keystroke**: too small without
  a trace.
- **Nested scans in `dedupeByTmdb`, `withLoggedEpisodes`, notification
  dedupe, `traktHasFilm`**: tens × tens, or once per log.
- **`wikidata.ts`, `continue-reading.ts`, `reading-bridge.ts`,
  `hardcover/reads.ts`, `add-to-list-picker.tsx`**: one request per read and
  scoped invalidations.

### Not audited in round 6

- Native code, `src/app/dev/*`, `src/app/up-next-demo.tsx`, `worker/` proxies.
- Runtime behaviour. No profiler, no device, no browser. React Compiler
  claims come from its compiled output.
- Categories other than performance.
