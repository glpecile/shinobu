---
title: Android Release Pipeline + F-Droid Analysis - Plan
type: feat
date: 2026-07-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Android Release Pipeline + F-Droid Analysis - Plan

## Goal Capsule

- **Objective:** Ship an otraku-style release channel: tag-triggered GitHub Actions workflow that builds signed Android APKs and attaches them to a GitHub Release with generated notes, plus a written F-Droid/IzzyOnDroid distribution analysis and runbook. Everything runs on free infrastructure (public repo → free Actions minutes; no EAS paid services).
- **Authority:** AGENTS.md conventions (CNG — never hand-edit `android/`; changes go through `app.json`/config plugins) override this plan; this plan overrides implementer preference; the owner's live decisions override both.
- **Execution profile:** `execution: code`. Mostly CI/config/packaging — prefer dry-run smoke verification over unit coverage, except the pure version-bump script which is test-first.
- **Stop conditions:** Stop and surface — do not guess — if (a) anything would require committing a keystore, password, or other secret to the repo, (b) signing cannot be injected through a config plugin + gradle properties (i.e. would require hand-editing generated `android/`), or (c) a step would require a paid service (EAS build, macOS runners). **Never create a git tag or publish a GitHub Release yourself** — those are owner-triggered; the workflow's `workflow_dispatch` dry-run is the agent-verifiable path.
- **Tail ownership:** Implementer lands workflow + scripts + docs via PR and verifies the unsigned dry-run in CI. The owner performs the one-time manual steps (keystore generation, GitHub secrets, first tag, IzzyOnDroid submission), which the runbook (U5) must spell out exactly.

---

## Product Contract

### Summary

Add release plumbing: a FOSS license, explicit app versioning in `app.json` with a bump script, a config plugin that injects Android release signing from gradle properties (falling back to debug signing so unsigned dry-runs work), a `release.yml` workflow (tag `v*` → prebuild → gradle → universal + arm64-v8a APKs + sha256 sums → GitHub Release with categorized auto-notes), and `docs/releasing.md` containing the owner runbook plus the F-Droid/IzzyOnDroid feasibility analysis with a concrete recommendation.

### Problem Frame

Shinobu has no distribution story: no version field, no license, no build pipeline, no downloadable artifact. The reference (otraku, `lotusprey/otraku/releases`) tags versions, attaches APK variants to GitHub Releases, and distributes through Google Play + IzzyOnDroid + GitHub — all compatible with a zero-budget, no-backend project. F-Droid proper has known friction with Expo apps that must be analyzed honestly rather than assumed away.

### Requirements

**Versioning & metadata**

- R1. The repo carries a FOSS license file (GPL-3.0 — see Open Questions; matches otraku and satisfies F-Droid/IzzyOnDroid inclusion).
- R2. `app.json` declares `expo.version` (start `0.1.0`) and `expo.android.versionCode`; a `bun release:bump <patch|minor|major|x.y.z>` script updates both (versionCode strictly monotonic) so agents and humans bump identically.
- R3. Release tags are `vX.Y.Z` and must match `expo.version`; the workflow fails fast on mismatch instead of shipping a mislabeled build.

**Build & signing**

- R4. A GitHub Actions workflow builds release APKs from a tag push (`v*`) and from manual `workflow_dispatch` (dry-run), using `expo prebuild --platform android` + gradle on ubuntu runners — no EAS.
- R5. Release signing is injected via config plugin from gradle properties/environment (keystore decoded from a GitHub secret at build time). With no secrets present (forks, dry-runs) the build falls back to debug signing and still succeeds — the workflow marks such artifacts `-unsigned-debug`.
- R6. Artifacts: `shinobu-vX.Y.Z-universal.apk` and `shinobu-vX.Y.Z-arm64-v8a.apk` (via `-PreactNativeArchitectures`), each with a `.sha256` checksum file.

**Publishing**

- R7. On tag builds, the workflow creates the GitHub Release (if absent) and attaches the APKs + checksums, with auto-generated notes categorized via `.github/release.yml` (Features / Fixes / Other from PR titles, which already follow `feat:`/`fix:` convention).
- R8. `docs/releasing.md` documents the full owner runbook: one-time keystore generation (`keytool`), the exact GitHub secret names, the bump→tag→push flow, and how to verify a published APK's signature/checksum.

**Distribution analysis**

- R9. `docs/releasing.md` contains an F-Droid analysis section covering: main-repo feasibility for this Expo/CNG app (build-server toolchain, prebuild requirement, `expo-notifications`' bundled Firebase/GMS classes once plan 0020 lands, reproducible-builds bar), the IzzyOnDroid alternative (developer-signed APKs pulled from GitHub Releases, FOSS license requirement, tracker scan, APK size expectations), and a concrete recommendation with a submission checklist for the chosen route.

### Scope Boundaries

**Deferred to Follow-Up Work**

- In-app update check against the GitHub Releases API (otraku-style "new version available") — natural follow-up once releases exist.
- Google Play / iOS (TestFlight or unsigned IPA sideload) distribution.
- Web production deploy in the release workflow (`bun run deploy:web` stays a separate manual/CI concern).
- Actual main-F-Droid submission (metadata repo MR, reproducible builds work) — only if the analysis recommendation is later revisited.

**Out of scope**

- Paid CI/build services (EAS build, macOS runners).
- AAB/Play-Store bundle output (APK sideloading is the point).

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **Plain gradle on CI, not EAS.** `bunx expo prebuild --platform android` regenerates `android/` on the runner (CNG stays intact — the generated project is ephemeral CI output, never committed), then `./gradlew assembleRelease`. Ubuntu runners ship the Android SDK; add `setup-java` (Temurin 17) and bun via `oven-sh/setup-bun`. Rejected: committing `android/` (violates CNG) and EAS build (paid, unnecessary).
- KTD-2. **Signing via config plugin + gradle properties, debug fallback.** A local config plugin (`plugins/with-release-signing.js`, registered in `app.json`) rewrites the generated app `build.gradle` to add a `release` signing config sourced from `SHINOBU_UPLOAD_STORE_FILE` / `SHINOBU_UPLOAD_STORE_PASSWORD` / `SHINOBU_UPLOAD_KEY_ALIAS` / `SHINOBU_UPLOAD_KEY_PASSWORD` gradle properties, keeping debug signing when they're absent. CI passes them as `ORG_GRADLE_PROJECT_*` env vars and decodes the keystore from the `SHINOBU_KEYSTORE_BASE64` secret into the runner workspace. This is the sanctioned CNG mechanism — config plugins own native edits (AGENTS.md). Rejected: sed-patching `android/` in the workflow (fragile, violates the spirit of the CNG rule even on ephemeral output).
- KTD-3. **Two artifacts: universal + arm64-v8a.** Build twice using `-PreactNativeArchitectures=arm64-v8a` for the slim APK (what ~all modern phones install; also the one whose size matters for IzzyOnDroid) and unrestricted for the universal fallback. Rejected: gradle ABI splits config (needs deeper native config for marginal benefit) and per-ABI × 4 artifacts (otraku-style, but two covers real demand).
- KTD-4. **`gh release create/upload` from the workflow with `GITHUB_TOKEN`,** `--generate-notes` + `.github/release.yml` categories. Rejected: third-party release actions (unnecessary dependency; `gh` is preinstalled).
- KTD-5. **versionCode = monotonic integer maintained by the bump script** (increment by 1 per release, stored explicitly in `app.json`). Rejected: deriving from semver (`major*10000+…`) — breaks the day a hotfix branches — and CI-computed codes (versionCode must be reviewable in the repo).
- KTD-6. **License: GPL-3.0-only** — F-Droid/Izzy compatible, matches the reference app, and copyleft suits a personal client app. This is an owner-rights decision: flagged in Open Questions; the unit proceeds with GPL-3.0 unless the owner overrides before landing.

### F-Droid analysis — findings to carry into R9's doc

Research already gathered (write-up in U6 sources these, verifying against current policy at execution time):

- **Main F-Droid repo:** fdroiddata builders must build from source with pinned FOSS toolchains; Expo/React-Native apps face (a) Node/bun toolchain provisioning in build recipes, (b) `expo prebuild` inside the recipe, (c) dependency scanning — `expo-notifications` (arriving with plan 0020) pulls Firebase Messaging classes on Android even for local-only use, which trips the non-free/tracker scanners unless excluded via gradle, (d) the practical bar of reproducible builds. Precedents exist but each cost significant maintenance. Verdict to document: **not now; revisit after the app stabilizes**, with the gradle-exclusion experiment for Firebase as the named unblocker.
- **IzzyOnDroid:** accepts official developer-signed APKs straight from GitHub Releases; requirements are a FOSS license (R1), a public repo with APK assets (R6/R7), passing their library/tracker scan (Firebase Messaging presence gets flagged — document the expected scan outcome and the gradle exclusion option), and staying within their APK size policy (arm64 artifact is the candidate; note current size limits at submission time). Verdict to document: **primary target — submit after the first tagged release.** Submission is an owner action (request via the IzzyOnDroid channel), spelled out as a checklist.

### Assumptions

- Repo is public (verified) → Actions minutes free, `gh` available with `GITHUB_TOKEN`.
- PR titles keep following conventional prefixes, so auto-notes categorize meaningfully.

### Open Questions

- **License choice (deferred, default GPL-3.0-only).** Owner may prefer MIT/Apache-2.0; any FOSS license satisfies R1/Izzy. Non-blocking: U1 proceeds with GPL-3.0 unless overridden at review.

---

## Implementation Units

### U1. License, versioning, bump script

**Goal:** Add `LICENSE` (GPL-3.0-only), set `expo.version: "0.1.0"` + `expo.android.versionCode: 1`, add `scripts/bump-version.ts` + `release:bump` script entry.
**Requirements:** R1, R2, KTD-5, KTD-6.
**Dependencies:** none.
**Files:** `LICENSE`, `app.json`, `package.json`, `scripts/bump-version.ts`, `scripts/bump-version.test.ts`.
**Approach:** Bump script edits `app.json` in place (preserve formatting via read-modify-write of the parsed object + 2-space stringify, matching current file style): semver bump or explicit version; always `versionCode += 1`; prints the `git tag` command to run next. Pure core function separated from the fs wrapper for testing.
**Test scenarios:** (1) `patch` on `0.1.0`/code 1 → `0.1.1`/code 2; (2) explicit `1.0.0` → version set, code incremented; (3) invalid input → non-zero exit, file untouched; (4) downgrade attempt (`0.0.9` after `0.1.0`) → refused.
**Verification:** `bun test`; `bun release:bump patch` on a scratch branch produces a clean, minimal `app.json` diff.

### U2. Release-signing config plugin

**Goal:** `plugins/with-release-signing.js` injects a gradle-property-sourced release signing config with debug fallback; registered in `app.json`.
**Requirements:** R5, KTD-2.
**Dependencies:** none.
**Files:** `plugins/with-release-signing.js`, `app.json`.
**Approach:** Use `withAppBuildGradle` from `expo/config-plugins` to insert the signing block (guarded so re-running prebuild is idempotent). Property names per KTD-2. Keep it dependency-free JS (config plugins run under Expo CLI's Node).
**Test scenarios:** Test expectation: none — config plugin; proven by prebuild inspection below.
**Verification:** `bunx expo prebuild --platform android` twice (idempotency); generated `android/app/build.gradle` contains the conditional signing config; `./gradlew assembleRelease` locally without properties produces a debug-signed release APK (fallback path).

### U3. Release workflow

**Goal:** `.github/workflows/release.yml`: tag `v*` + `workflow_dispatch`; checkout → bun install → Temurin 17 → keystore decode (when secret present) → prebuild → two gradle builds (KTD-3) → rename artifacts + sha256 → on tags, `gh release create`/upload.
**Requirements:** R3, R4, R5, R6, R7 (upload half), KTD-1–KTD-4.
**Dependencies:** U1 (version check), U2 (signing).
**Files:** `.github/workflows/release.yml`.
**Approach:** Fail fast when `github.ref_name` ≠ `v${expo.version}` (tag runs only). Secrets absent → skip keystore step, suffix artifacts `-unsigned-debug`, and never create a release from a dispatch run (upload as workflow artifacts instead — that's the agent-verifiable dry-run). Cache gradle + bun. Keep the existing `ci.yml` untouched.
**Test scenarios:** Test expectation: none — CI unit; scenarios live in the dry-run matrix: (1) dispatch without secrets → two debug APKs + checksums as workflow artifacts; (2) version-mismatch simulation (dispatch input) → failing step with clear message.
**Verification:** `workflow_dispatch` run green on the PR branch; artifact names and sizes sane (arm64 < universal); `unzip -l` shows expected ABI dirs in each.

### U4. Auto-notes configuration

**Goal:** `.github/release.yml` categorizing generated notes (Features / Fixes / Maintenance, excluding bot/chore noise).
**Requirements:** R7 (notes half).
**Dependencies:** none.
**Files:** `.github/release.yml`.
**Test scenarios:** Test expectation: none — declarative config; verified on the first real release (owner) and by YAML lint in CI.
**Verification:** `bun lint` unaffected; YAML parses (workflow run or `python -c "import yaml,sys;yaml.safe_load(open('.github/release.yml'))"`).

### U5. Releasing runbook

**Goal:** `docs/releasing.md` — owner-facing: keystore generation commands, secret names/values table, bump→tag→push flow, dry-run instructions, signature/checksum verification of a downloaded APK.
**Requirements:** R8.
**Dependencies:** U1–U3 (documents them).
**Files:** `docs/releasing.md`.
**Approach:** Mark owner-only steps explicitly (agents must not perform them — mirrors Goal Capsule stop conditions). Include the `keytool -genkeypair` one-liner, base64 encode/decode commands, and `apksigner verify` usage.
**Test scenarios:** Test expectation: none — documentation; reviewed against the workflow for name drift (secret names, artifact names quoted verbatim from U3).
**Verification:** Every secret/property/artifact name in the doc greps identically in `release.yml`/`with-release-signing.js`.

### U6. F-Droid / IzzyOnDroid analysis

**Goal:** The R9 analysis section in `docs/releasing.md` with a concrete recommendation (IzzyOnDroid first; main F-Droid deferred with named unblockers) and the Izzy submission checklist.
**Requirements:** R9.
**Dependencies:** U5 (same document).
**Files:** `docs/releasing.md`.
**Approach:** Start from the findings in this plan's Planning Contract; verify current policy at execution time (Izzy size limits and tracker-scan policy, F-Droid inclusion policy for RN/Expo) and cite sources with dates. Name the `expo-notifications`→Firebase implication for plan 0020 explicitly so the two plans stay consistent.
**Test scenarios:** Test expectation: none — analysis document.
**Verification:** Recommendation is decisive (no "it depends" ending); checklist steps are actionable by the owner without further research.

---

## Verification Contract

- `bun test`, `bun typecheck`, `bun lint` — green (bump script covered).
- Local: double prebuild idempotent; fallback debug-signed `assembleRelease` succeeds.
- CI: `workflow_dispatch` dry-run green from the PR branch, producing both APKs + checksums as workflow artifacts, without any secret configured.
- No secret material anywhere in the diff (review grep: `store.*password|keystore` outside docs/plugin property *names*).
- The signed path is verified by the owner on the first real tag — the plan is done without it (see Tail ownership).

## Definition of Done

- R1–R9 satisfied; dry-run proof linked in the PR.
- No tags or releases created by the implementer; no committed secrets; no hand-edits under `android/`.
- `docs/releasing.md` internally consistent with workflow/plugin names (U5 verification).
- Abandoned experiments removed from the diff.
