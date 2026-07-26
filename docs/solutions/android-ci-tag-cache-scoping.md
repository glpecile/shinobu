# Tag-triggered release builds are always cold: Actions caches are ref-scoped

**Date:** 2026-07-26 · **Context:** plan 0025, `.github/workflows/release.yml` +
`.github/workflows/android-warm.yml`

## Symptom

Every tagged Android release took ~38 minutes, effectively all of it in one
step. Tag `v0.1.1` (run
[30175163780](https://github.com/glpecile/shinobu/actions/runs/30175163780)):

- "Build universal release APK" — **35m34s**
- "Build arm64-v8a release APK" — **1m51s**

The same gradle task, twice, 19× apart. The second invocation was fast because
the first had just built everything — so the 35 minutes was cold-start cost, not
build cost. Two tells in the log: the `Cache Gradle` restore completed in **0
seconds**, and Gradle 9.3.1 was downloaded from `services.gradle.org` mid-build.
The cache had never hit. Not once, across every release.

## Root cause: GitHub scopes caches per ref, and tags are dead ends

A workflow run can read caches created on **its own ref** or on the **default
branch** — nothing else. GitHub's caching docs say it outright: a cache created
for tag `release-a` is not accessible to a run triggered for tag `release-b`.

So the release workflow's `actions/cache` step was writing a ~2.2 GB entry
scoped to `refs/tags/vX.Y.Z` on every release, and every *subsequent* release,
running on a different tag, could not see it. Meanwhile nothing on `main`
(`ci.yml`, `link-health.yml`, `pr-labels.yml`) ever invoked Gradle, so the
default-branch fallback had nothing in it either. There was no cache in the
universe a tag run was allowed to restore.

The cost lands on native code: `expo prebuild` regenerates `android/` from
scratch (CNG), then AGP compiles the C++ of nitro-modules, nitro-fetch, mmkv,
reanimated and expo-modules for **all four ABIs** — 820 cacheable compiler
invocations, from zero, every time.

**This is invisible in a green build.** Nothing fails; the cache step reports
success and takes 0 seconds. Only the wall-clock and the absence of a "Cache
restored from key:" line give it away.

## Fix: warm the default branch, read-only everywhere else

`.github/workflows/android-warm.yml` runs the same universal `assembleRelease`
on `main` — on Android-affecting pushes, weekly, and on demand — so the caches a
tag run *is* allowed to restore actually exist. `release.yml` only consumes
them. Three pieces:

1. **`gradle/actions/setup-gradle`** (SHA-pinned to v6.2.0) replaces the
   hand-rolled `actions/cache` of `~/.gradle`. It caches the wrapper
   distribution, dependencies, transforms and the local build cache as separate
   content-keyed entries, cleans up locks and unused state before saving, and
   defaults to *write on the default branch, read-only elsewhere* — the exact
   scoping this problem needs, as a default rather than something to remember.
   `gradle-home-cache-strict-match` is deliberately left at its default
   (`false`) so `release.yml`'s job correlator (`build[...]`) can still restore
   entries written under the warm workflow's (`warm[...]`).
2. **`ccache`** for the NDK/CMake compile, enabled with nothing but
   `CMAKE_C_COMPILER_LAUNCHER=ccache` / `CMAKE_CXX_COMPILER_LAUNCHER=ccache` in
   the job `env` — CMake ≥ 3.17 initializes the corresponding CMake variables
   from those environment variables, so no config plugin and no edit to
   generated `android/` files (the RN docs' symlink-masquerade setup is
   unnecessary in CI). `CCACHE_COMPILERCHECK=content` is not optional: the
   default mtime+size check misses every time the runner image rolls the NDK
   toolchain's timestamps.
3. **Build flags** — `--build-cache`, no `--no-daemon` (the arm64 invocation
   reuses the warm daemon), and `-Dorg.gradle.jvmargs="-Xmx4g
   -XX:MaxMetaspaceSize=1g"` to replace the generated `-Xmx2048m` default. Flags
   on the command line, because `android/gradle.properties` is CNG output and
   cannot be edited in the repo.

### Two non-obvious knobs

- **The ccache key must never hit exactly.** It is
  `ccache-android-<os>-<hash(bun.lock, app.json)>-${{ github.run_id }}` with
  prefix `restore-keys`. On an exact key hit `actions/cache` skips its post-job
  save, so a refreshed ccache would never persist and the cache would silently
  decay toward uselessness. The run-id suffix guarantees a miss-then-save; the
  restore-keys do the actual restoring.
- **The release workflow uses `actions/cache/restore`, not `actions/cache`.** A
  save from a tag run is invisible to every future run (that's the whole bug) and
  would only burn quota.

## Cache-integrity invariant

`main`-scoped caches are **executable-code inputs to signed release APKs**. The
secretless warm workflow on the default branch is their only writer:

- `android-warm.yml` declares `permissions:` / `contents: read` and takes no
  secrets — it does not even write `.env.local`, since provider credentials
  change the JS bundle, not anything compiled or cached.
- `release.yml` sets `cache-read-only: true` **explicitly** rather than
  inheriting the write-on-default-branch default. `workflow_dispatch` dry-runs
  execute on `main` *with* the decoded keystore and signing secrets in the
  environment; without the explicit flag they would qualify as cache writers.

Granting cache-write to another ref or trigger is a security-reviewed change —
the same reviewed-against-invariants treatment as the Worker proxy contracts in
AGENTS.md.

## Measured

| Run | universal APK | arm64 APK | total job |
| --- | --- | --- | --- |
| Baseline, cold tag `v0.1.1` ([30175163780](https://github.com/glpecile/shinobu/actions/runs/30175163780)) | 35m34s | 1m51s | 38m19s |
| Warm workflow, cold ([30181017585](https://github.com/glpecile/shinobu/actions/runs/30181017585)) | 37m33s | — | 39m05s |
| Warm workflow, warm ([30182224405](https://github.com/glpecile/shinobu/actions/runs/30182224405)) | **8m13s** | — | 9m51s |
| `release.yml` warm dry-run ([30182550322](https://github.com/glpecile/shinobu/actions/runs/30182550322)) | **9m47s** | 1m16s | **12m07s** |
| Real warm tag `v0.1.2` ([30205881828](https://github.com/glpecile/shinobu/actions/runs/30205881828)) | **10m16s** | 1m19s | **12m44s** |

The first warm-workflow run is ~2 minutes *slower* than the cold baseline —
that's ccache storing 820 objects it can't yet hit. It pays for itself once.

The `v0.1.2` row is the one that settles it: a genuine tag push, on a ref that
by construction has no cache of its own, restoring `main`'s — **3.5× faster
than the identical build at `v0.1.1`**. Note its ccache key,
`ccache-android-Linux-b613f390…-30183164587`: a version bump edits `app.json`,
which is in the key's hash, so the entry it hit was the one written by the warm
run that the bump commit itself triggered. That is the mechanism working as
designed, not luck — and had that run not finished in time, the broader
`ccache-android-Linux-` restore-key would still have hit.

What the warm release runs' logs show, against the cold one:

- No `Downloading https://services.gradle.org/...` line at all.
- `ccache -s`: **820 / 820 direct hits (100%)**, versus 820/820 misses cold.
  (820 of 1656 compiler invocations are cacheable; the rest are link/archive
  steps ccache doesn't handle.)
- Gradle: `1288 actionable tasks: 818 executed, 470 from cache` — versus
  `1113 executed, 175 from cache` cold. The RN gradle plugin's bundle/hermesc
  task and AGP's `externalNativeBuild` tasks are **not** cacheable, which is
  exactly why ccache carries the C++ and JS bundling still runs in full.
- The second (arm64) invocation: `1216 actionable tasks: 129 executed, 1087
  up-to-date` in 1m15s — the reused daemon, from dropping `--no-daemon`.

Artifacts are unchanged: same names, all four ABI directories in the universal
APK (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`), one in the arm64 APK, sizes
within 0.02% of the baseline release assets, same signing mode.

## Keeping it working

- **Quota is 10 GB per repo, with 7-day eviction of unused entries.** The warm
  set is ~2.7 GB (dependencies 1.11 GB, transforms 901 MB, ccache 165 MB,
  local build cache 139 MB, wrapper 136 MB, plus small ones). The weekly
  `schedule` trigger exists solely so releases cut more than a week apart don't
  land cold again.
- **Over quota, GitHub evicts least-recently-used** — so stale entries are not
  harmless. Migrating to `setup-gradle` orphaned three 2.2 GB `gradle-Linux-*`
  entries from the old manual step (on `v0.1.0`, `v0.1.1` and a feature branch),
  which pushed the repo to 9.38 GB of 10 GB and put the new warm caches at risk
  of eviction. Nothing requests that key prefix any more; delete orphans after a
  cache-strategy change:

  ```sh
  gh api "repos/<owner>/<repo>/actions/caches?per_page=50" \
    --jq '.actions_caches[] | select(.key|startswith("gradle-Linux-")) | .id' \
  | xargs -I{} gh api -X DELETE "repos/<owner>/<repo>/actions/caches/{}"
  ```

- **GitHub disables `schedule` triggers after ~60 days without repository
  activity.** A dormant repo's first release therefore lands cold (~38 min)
  and re-enabling the workflow is manual. If the repo has been quiet, run
  `gh workflow run android-warm.yml --ref main` and let it finish before
  tagging.
- **A tag far behind `main` degrades gracefully**, it doesn't break: the
  content-keyed Gradle entries and the ccache prefix restore-keys still hit;
  only the task-output build cache loses ground.

## Gotchas met along the way

- **A new workflow cannot be dispatched before it is on the default branch.**
  `gh workflow run android-warm.yml --ref <feature-branch>` returns
  `HTTP 404: workflow not found on the default branch`. There is no pre-merge
  proof for a workflow whose entire purpose is writing default-branch-scoped
  caches — it has to merge first.
- **`setup-gradle` uses a proprietary caching provider.** The action logs
  `Enhanced Caching: This build is using the proprietary
  'gradle-actions-caching' provider` (see the action's `DISTRIBUTION.md` for
  terms and the opt-out). CI-only — nothing of it reaches the shipped APK.

## Related

- `docs/plans/0025-release-ci-build-speed.md` — the plan, its KTDs and the
  deferred options (dropping `x86`/`x86_64`, Gradle configuration cache).
- `docs/plans/0021-android-release-pipeline.md` / `docs/releasing.md` — what
  `release.yml` builds and the owner runbook for cutting a tag.
