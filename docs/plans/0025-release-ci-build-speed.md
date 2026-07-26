---
title: Release CI Build Speed - Plan
type: perf
date: 2026-07-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Release CI Build Speed - Plan

## Goal Capsule

- **Objective:** Cut the tag-triggered Android release build (`.github/workflows/release.yml`) from ~38 minutes (35m34s for the universal APK alone, run 30175163780) to under ~15 minutes on a warm cache, on free GitHub-hosted runners.
- **Authority:** AGENTS.md conventions (CNG — never hand-edit `android/`; native-level changes go through `app.json`, config plugins, or the workflow) and plan 0021's KTDs (no EAS, no paid services) override this plan; this plan overrides implementer preference; the owner's live decisions override both.
- **Execution profile:** `execution: code`. CI/config work — prefer dry-run smoke verification (workflow_dispatch runs, cache-hit evidence in logs) over unit coverage.
- **Stop conditions:** Stop and surface — do not guess — if (a) a change would require a paid service or larger runner, (b) a change would require committing generated `android/` output or hand-editing it in the repo, or (c) artifact names, signing behavior, or the dry-run path would change. **Never create a git tag or publish a GitHub Release** — `workflow_dispatch` dry-runs are the agent-verifiable path.
- **Tail ownership:** Implementer lands the workflow changes via PR, proves them with the Verification Contract's dispatch sequence (warm-workflow run cold, warm-workflow run warm, then a warm `release.yml` dry-run), and records measurements. The owner observes the real improvement on the next tag push; no owner setup steps are required (no new secrets).

---

## Product Contract

### Summary

Make release builds warm instead of cold: populate Gradle and native-compile caches from `main` (the only ref whose caches tag runs can restore), adopt `gradle/actions/setup-gradle` for correct cache management, add `ccache` for the NDK/C++ compile that dominates the 35 minutes, and enable the Gradle build cache + daemon + a larger heap on the build commands. Artifacts, signing, and the dry-run path stay byte-for-byte equivalent in shape.

### Problem Frame

Run 30175163780 (tag `v0.1.1`) spent 35m34s in `./gradlew :app:assembleRelease` while the follow-up arm64-only build took 1m51s — the delta is cold-start cost, not inherent build cost. The `Cache Gradle` restore completed in 0 seconds and the log shows Gradle 9.3.1 being downloaded: a total cache miss. Root cause: GitHub Actions cache scoping — a tag run can restore caches created on its own ref or the default branch, never on another tag ("A cache created for the tag `release-a` … would not be accessible to a workflow run triggered for the tag `release-b`", GitHub caching docs). no workflow running on `main` (`ci.yml`, `link-health.yml`, `pr-labels.yml`) touches Gradle, so no restorable cache has ever existed: every release recompiles all native C++ (nitro-modules, nitro-fetch, mmkv, reanimated, expo-modules) across 4 ABIs from scratch.

### Requirements

**Cache correctness**

- R1. Tag-triggered release runs restore a Gradle cache (wrapper distribution + dependencies + local build cache) populated from `main` — the build log must not show a Gradle distribution download on a warm run.
- R2. Native C++ compilation goes through `ccache`, with the ccache directory cached from `main` and restored on tag runs.
- R3. A workflow on `main` keeps both caches warm: triggered when Android-affecting inputs change, plus a weekly schedule so GitHub's 7-day cache eviction never leaves a release cold, plus `workflow_dispatch`.

**Build configuration**

- R4. Release builds enable the Gradle build cache and share a daemon across the two `assembleRelease` invocations, with a JVM heap sized for the runner (current generated default is `-Xmx2048m` on a 16 GB machine) — all injected via command-line flags/env, never by editing generated `android/` files in the repo.

**Invariants & evidence**

- R5. Artifact names, contents (4-ABI universal + arm64-v8a), signing modes, checksums, the tag-version check, and the `workflow_dispatch` dry-run path are unchanged.
- R6. Before/after timings and the tag-cache-scoping gotcha are recorded in `docs/solutions/` (AGENTS.md: non-obvious fixes get a solutions doc).

### Scope Boundaries

**Deferred to Follow-Up Work**

- Dropping `x86`/`x86_64` from the universal APK (`-PreactNativeArchitectures=armeabi-v7a,arm64-v8a`) — roughly halves cold native compile but changes what "universal" means (no emulator installs). Only worth the owner discussion if warm builds still miss the target.
- Single-invocation ABI splits (one gradle run producing both artifacts) — the second invocation costs ~2 minutes warm; not worth custom native config (plan 0021 KTD-3 already rejected splits).
- Gradle configuration cache — highest-friction Gradle feature with RN/Expo plugins; revisit only after the above land and stabilize.
- iOS build caching (no iOS CI pipeline exists yet).

**Out of scope**

- Paid runners, larger runners, EAS, or any hosted build service.
- Changing release cadence, artifact set, or signing (plan 0021 owns those).

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **Warm caches from `main` via a dedicated workflow** (`.github/workflows/android-warm.yml`). This is the only mechanism that can ever make a tag run warm: GitHub cache scoping restricts tag runs to caches from their own ref or the default branch, and previous-tag caches are structurally invisible. The warm job runs the same prebuild + universal `assembleRelease` as the release workflow (secretless — the debug-signing fallback from plan 0021 KTD-2 makes that work by design) and doubles as a release-build canary: a broken Android build surfaces on `main`, not at tag time. Rejected: relying on prior tag caches (impossible), warming inside `ci.yml` (35-minute cold warms would blur the fast merge gate; `ci.yml` stays untouched per plan 0021 U3). **Integrity invariant (record in the U3 solutions doc too):** `main`-scoped caches are executable-code inputs to signed release APKs; only the secretless warm workflow on the default branch writes them, and any change that adds cache-write ability to another trigger or ref is a security-reviewed change — same reviewed-against-invariants treatment as the Worker proxy contracts in AGENTS.md.
- KTD-2. **Replace the hand-rolled `actions/cache` step with `gradle/actions/setup-gradle@v6`** in both the release and warm workflows. Its default `cache-read-only` behavior — write caches only on the default branch, read-only everywhere else — is exactly the scoping this problem needs, and it caches the wrapper distribution, dependencies, and local build cache with proper cleanup (no stale-lock or ever-growing-cache issues that naive `~/.gradle/caches` archiving has). Rejected: keeping manual `actions/cache` keys (the current approach is what silently never hit). Because `release.yml` is the workflow where the decoded keystore lives, pin the newly added action to a full commit SHA (v6.x noted in a trailing comment); the warm workflow follows suit for consistency.
- KTD-3. **`ccache` for the NDK/CMake compile, enabled via environment variables** (`CMAKE_C_COMPILER_LAUNCHER=ccache`, `CMAKE_CXX_COMPILER_LAUNCHER=ccache` — honored by CMake ≥3.17, which AGP's NDK builds use), with an explicit `CCACHE_DIR` cached under a key of `bun.lock` + `app.json` **suffixed with `github.run_id`** and prefix restore-keys (an exact-key hit would make `actions/cache` skip the post-job save, so refreshed contents would never persist and the cache would silently decay), `CCACHE_COMPILERCHECK=content` (the default mtime+size check misses whenever the runner image rolls the NDK toolchain's mtimes), and `CCACHE_MAXSIZE` capped (~1.5 GB). C++ compilation of the native modules across 4 ABIs is the dominant share of the 35 minutes; a warm ccache turns most of it into cache lookups even when Gradle task caching misses. Use `actions/cache` (save) in the warm workflow and `actions/cache/restore` (restore-only) in the release workflow — saves from tag runs would be invisible to every future run and only burn the 10 GB repo cache quota. Rejected: the RN docs' symlink-masquerade setup (env vars are cleaner in CI and need no config-plugin change).
- KTD-4. **Build-command tuning via flags, respecting CNG:** add `--build-cache` (Gradle task-output cache; on a tag cut from the warmed `main` commit AGP Java/Kotlin/resource tasks hit — the RN gradle plugin's bundle/hermesc task and AGP's `externalNativeBuild` tasks are not cacheable, so JS bundling runs in full each release and C++ relies on ccache), drop `--no-daemon` (the second `assembleRelease` reuses the warm daemon), and raise the heap with `-Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g"` on the command line. Command-line flags are the sanctioned channel — the generated `android/gradle.properties` cannot be edited in the repo, and plan 0021 KTD-2 already rejected sed-patching generated files.
- KTD-5. **Keep the 4-ABI universal artifact.** Caching should make it affordable; ABI reduction is a product decision (deferred, see Scope Boundaries), not a performance necessity.

### Cache budget & freshness

Repo cache quota is 10 GB with ~7-day unused-entry eviction. Expected footprint: Gradle user home ~2–3 GB compressed + ccache ≤1.5 GB + bun cache (negligible) — comfortably inside quota. The warm workflow's weekly `schedule` trigger is the eviction guard: releases rarer than 7 days apart would otherwise land cold again.

### Assumptions

- The tag is cut from (or very near) the `main` HEAD that last ran the warm workflow, so Gradle build-cache and ccache hit rates are high. A tag far behind `main` degrades gracefully to partial hits.
- `ubuntu-latest` (4 vCPU) public-repo runners remain free and keep shipping the Android SDK/NDK; `ccache` is available via `apt-get` (fast install) if not preinstalled.
- The warm workflow's ~35-minute first run (and occasional cold re-warms) on `main` are acceptable — public-repo Actions minutes are free and it blocks nothing.

### Open Questions

- **ABI reduction (deferred, non-blocking).** If warm tag builds still exceed ~15 minutes, ask the owner whether the universal APK may drop `x86`/`x86_64`. Default: keep all four ABIs.

---

## Implementation Units

### U1. Cache-warm + canary workflow on main

**Goal:** `.github/workflows/android-warm.yml`: on `push` to `main` filtered to Android-affecting paths (`bun.lock`, `package.json`, `app.json`, `plugins/**`, `.github/workflows/release.yml`, `.github/workflows/android-warm.yml`), plus weekly `schedule` and `workflow_dispatch` — prebuild, then a secretless universal `assembleRelease` that populates the Gradle cache (via `setup-gradle@v6`, which writes on the default branch) and the ccache (via `actions/cache`).
**Requirements:** R1, R2, R3, KTD-1, KTD-2, KTD-3.
**Dependencies:** none.
**Files:** `.github/workflows/android-warm.yml`.
**Approach:** Mirror `release.yml`'s setup steps (checkout, bun, Temurin 17, `.env.local` write is unnecessary — credentials don't affect compilation, skip it; prebuild) but no signing, no artifact staging, no release. Declare `permissions: contents: read` at the top — the warm build needs no write token, and it executes dependency code (postinstall scripts, gradle plugins) on a schedule. Same gradle flags as U2 so task-output cache keys match. Install/configure ccache before the build and run `ccache -z` right after the cache restore (stats live inside the cache directory, so without a reset `ccache -s` reports prior runs' cumulative hits); print `ccache -s` after the build as the per-run hit-rate log. `concurrency` group so overlapping main pushes cancel. A failed warm build should be visible (it is the canary) but must not block merges — it runs post-merge on `main`.
**Test scenarios:** Test expectation: none — CI unit; proven by the dispatch matrix in Verification.
**Verification:** Dispatch run green; `setup-gradle` post-job log shows a cache *write*; `actions/cache` saves the ccache. Second dispatch run shows Gradle cache *restored* (no `Downloading https://services.gradle.org/...` line) and nonzero ccache hits measured after the post-restore stats reset.

### U2. Release workflow consumes the caches

**Goal:** Rework `release.yml`'s build section: replace the manual `Cache Gradle` step with `setup-gradle@v6` (read-only on tags by default), add restore-only ccache (`actions/cache/restore` + env vars), and apply KTD-4 flags to both `assembleRelease` invocations (`--build-cache`, no `--no-daemon`, `-Dorg.gradle.jvmargs=…`).
**Requirements:** R1, R2, R4, R5, KTD-2, KTD-3, KTD-4.
**Dependencies:** U1 (a cache must exist on `main` for the warm path to be provable).
**Files:** `.github/workflows/release.yml`.
**Approach:** Keep every non-build step untouched (version check, signing, `.env.local`, staging, checksums, release upload, dry-run artifact upload). `setup-gradle` runs anywhere before the first `gradlew` invocation (after prebuild is fine); leave `gradle-home-cache-strict-match` unset (default false) so release runs restore the warm workflow's entries despite the differing job correlator, and set `cache-read-only: true` explicitly — dispatch dry-runs execute on `main` with signing secrets in the environment, and the warm workflow must stay the sole cache writer (KTD-1 invariant). Run `ccache -z` after the ccache restore; print `ccache -s` after the universal build. Preserve the header comment block's intent — extend it with one line on why caches are warmed from `main` (tag-scope gotcha), pointing at the solutions doc from U3.
**Test scenarios:** Test expectation: none — CI unit; scenarios: (1) dispatch dry-run after U1's warm run → no Gradle distribution download, ccache hits > 0, both APKs + checksums produced with unchanged names; (2) `unzip -l` on the universal APK shows all four ABI directories, arm64 APK smaller than universal.
**Verification:** Warm dispatch dry-run: "Build universal release APK" step wall-clock under ~15 minutes (record the number); artifacts and names identical to the pre-change run; signing fallback still yields `-unsigned-debug` suffix without secrets.

### U3. Measure and record the learning

**Goal:** A `docs/solutions/` entry (e.g. `docs/solutions/android-ci-tag-cache-scoping.md`) capturing: the symptom (0-second cache restore, 35-minute builds), the tag-scoping root cause, the warm-from-main fix, the KTD-1 cache-integrity invariant, cold vs. warm timings from the actual runs, the eviction/quota numbers that keep it working, and the caveat that GitHub auto-disables `schedule` triggers after ~60 days of repo inactivity (a dormant repo's first release lands cold again).
**Requirements:** R6.
**Dependencies:** U1, U2 (needs their measured runs).
**Files:** `docs/solutions/android-ci-tag-cache-scoping.md` (this plan file is not updated — plans are immutable decision artifacts).
**Test scenarios:** Test expectation: none — documentation.
**Verification:** Doc cites concrete run timings (cold baseline 35m34s vs. measured warm), and every workflow/step name in it greps identically in the two workflow files.

---

## Verification Contract

- `bun lint`, `bun typecheck`, `bun test` — green (no src changes expected; guard against accidental ones).
- YAML validity: both workflows parse (actionlint if available, else a dispatch run is the proof).
- CI evidence, in order: (1) U1 dispatch run #1 green with cache writes; (2) U1 dispatch run #2 green with Gradle cache restore + ccache hits; (3) `release.yml` dispatch dry-run green, warm, producing both APKs + checksums with unchanged names.
- **Exit metric:** warm "Build universal release APK" step ≤ ~15 minutes (baseline 35m34s). If the first warm run lands above target, record the measured split (`ccache -s`, gradle task timings) and surface the deferred ABI question instead of improvising scope changes.
- No new secrets; no committed `android/` output; `ci.yml` untouched.

## Definition of Done

- R1–R6 satisfied with dry-run evidence linked in the PR (cold vs. warm timings quoted).
- Warm-path measurement recorded in the solutions doc; tag-scoping gotcha documented.
- No tags or releases created by the implementer; artifact names, signing behavior, and dry-run semantics unchanged.
- Abandoned experiments removed from the diff.
