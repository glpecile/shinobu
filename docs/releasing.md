# Releasing Shinobu (Android)

This is the owner-facing runbook for cutting an Android release, plus the
F-Droid / IzzyOnDroid distribution analysis (docs/plans/0021). Everything here
runs on free infrastructure: `expo prebuild` + gradle on GitHub-hosted
`ubuntu-latest` runners (public repo → free Actions minutes), no EAS.

**Steps marked 🔒 are owner-only.** An agent implementing this plan must not
perform them — they involve real secrets, a real keystore, or an
irreversible publish action (creating a tag or a GitHub Release). The
agent-verifiable equivalent is always the `workflow_dispatch` dry-run.

## One-time setup 🔒

### 1. Generate the upload keystore

```sh
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore shinobu-upload-key.jks \
  -alias shinobu-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a store password and a key password (they can be the
same value). **Back up `shinobu-upload-key.jks` and both passwords somewhere
durable and outside this repo** — losing it means every future release must
ship under a new signing identity, which Android treats as a different app for
update purposes.

Never commit the `.jks` file or its passwords anywhere in this repository, in
a commit message, or in workflow logs.

### 2. Base64-encode the keystore and configure GitHub secrets

```sh
base64 -i shinobu-upload-key.jks | tr -d '\n' > shinobu-upload-key.b64
```

In the repo's **Settings → Secrets and variables → Actions**, create:

| Secret name | Value |
| --- | --- |
| `SHINOBU_KEYSTORE_BASE64` | contents of `shinobu-upload-key.b64` |
| `SHINOBU_UPLOAD_STORE_PASSWORD` | the keystore's store password |
| `SHINOBU_UPLOAD_KEY_ALIAS` | `shinobu-upload` (or whatever alias you used) |
| `SHINOBU_UPLOAD_KEY_PASSWORD` | the key password |

These are consumed by `.github/workflows/release.yml`, which decodes
`SHINOBU_KEYSTORE_BASE64` to a file at build time and exposes all four as
`ORG_GRADLE_PROJECT_*` environment variables. `plugins/with-release-signing.js`
reads them as gradle properties named `SHINOBU_UPLOAD_STORE_FILE`,
`SHINOBU_UPLOAD_STORE_PASSWORD`, `SHINOBU_UPLOAD_KEY_ALIAS`,
`SHINOBU_UPLOAD_KEY_PASSWORD` inside the generated `android/app/build.gradle`
(gradle property names match the secret names 1:1, except
`SHINOBU_UPLOAD_STORE_FILE`, which has no directly corresponding secret — it's
the decoded keystore's runner-local path, set by the workflow itself).

Delete the local `.b64`/`.jks` copies from your working directory once the
secrets are saved (or keep them only in your password manager / an encrypted
backup, never in a git-tracked location).

If these four secrets are absent, the workflow **does not fail** — it falls
back to Android's own debug signing and suffixes artifacts
`-unsigned-debug`. That's what makes the `workflow_dispatch` dry-run
agent-verifiable without ever touching real signing material.

### 3. Provider credentials (optional, but recommended)

These aren't signing material — they're the same builder-supplied
`EXPO_PUBLIC_*` credentials `.env.local` provides for local dev (AGENTS.md:
TMDB is "builder-supplied"; Trakt/AniList follow the same one-tap-connect
pattern). Baking them into the release build means the shipped APK connects
to each provider in one tap instead of falling back to per-user guided setup.
Unlike the signing key, these are inherently extractable from a public
APK once shipped — that's expected for embedded OAuth client credentials
(same threat model as any "public client" mobile app), not a leak.

| Secret name | Value |
| --- | --- |
| `EXPO_PUBLIC_TRAKT_CLIENT_ID` | your Trakt app's client id |
| `EXPO_PUBLIC_TRAKT_CLIENT_SECRET` | your Trakt app's client secret |
| `EXPO_PUBLIC_ANILIST_CLIENT_ID` | AniList **web** client id — no-op for Android, included for parity with local `.env.local` |
| `EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID` | AniList client registered to `shinobu://redirect` — the one Android actually uses |
| `EXPO_PUBLIC_TMDB_TOKEN` | TMDB v4 read token |

`release.yml`'s "Write provider credentials" step writes these into a
`.env.local` file before `expo prebuild`, exactly mirroring local dev. Any
subset can be absent — each consumer already treats a missing value as "ship
without this credential" (falls back to guided per-user setup), never a
build failure.

## Cutting a release

### 1. Bump the version

```sh
bun release:bump patch   # or: minor | major | 1.2.3
```

This updates `expo.version` and increments `expo.android.versionCode` in
`app.json` together (`scripts/bump-version.ts`) and prints the exact
commit/tag/push sequence to run next.

### 2. Commit, tag, and push 🔒

```sh
git commit -am "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

Pushing the `vX.Y.Z` tag is what triggers `.github/workflows/release.yml`.
The workflow fails fast if the tag doesn't match `expo.version` exactly (e.g.
pushing `v1.2.3` when `app.json` says `1.2.4`) — bump first, then tag, so
they never drift.

**Creating this tag is owner-only.** An implementer/agent must never run
`git tag` or `git push --tags` — that's the one irreversible action in this
whole flow (Goal Capsule stop condition).

### 3. What the workflow does

On the tag push, `release.yml`:

1. Checks the tag against `expo.version` (fails fast on mismatch).
2. Decodes the keystore secret (if configured) and builds two release APKs —
   `shinobu-vX.Y.Z-universal.apk` (all ABIs) and
   `shinobu-vX.Y.Z-arm64-v8a.apk` (`-PreactNativeArchitectures=arm64-v8a`,
   the slim build ~all modern phones actually need).
3. Generates a `.sha256` checksum file next to each APK.
4. Creates the GitHub Release (or updates it, if it already exists) with
   `gh release create --generate-notes`, categorized via
   `.github/release.yml` into Features / Fixes / Maintenance / Other Changes.
   Those categories are label-based (GitHub has no title-based
   categorization) — `.github/workflows/pr-labels.yml` applies the label
   automatically from each PR's `feat:`/`fix:`/`chore:`-style title prefix,
   so nobody has to hand-label PRs for this to work.

### 4. Dry-run verification (agent-verifiable, no secrets needed)

Run the workflow manually from a branch, without pushing a tag:

```sh
gh workflow run release.yml --ref <branch>
gh run watch   # or check the Actions tab
```

With no signing secrets configured, this builds both APKs debug-signed
(`-unsigned-debug` suffix) and uploads them as a `shinobu-dry-run-apks`
workflow artifact — it never creates a tag or a GitHub Release. This is the
verification path implementers use instead of a real release.

### 5. Verify a downloaded APK 🔒 (or anyone, really)

Checksum:

```sh
sha256sum -c shinobu-vX.Y.Z-arm64-v8a.apk.sha256
```

Signature (confirms it's genuinely signed with the upload key, not debug):

```sh
apksigner verify --print-certs shinobu-vX.Y.Z-arm64-v8a.apk
```

A real release should show your own certificate DN, not
`CN=Android Debug, OU=Android, O=Unknown, ...` — that debug DN is exactly what
an unsigned dry-run build shows instead.

## F-Droid / IzzyOnDroid distribution analysis

**Recommendation: IzzyOnDroid now; main F-Droid deferred, revisit after the
app stabilizes.** This isn't a hedge — the two repos have fundamentally
different acceptance models, and only one fits a solo-maintained Expo app
today.

### Main F-Droid repo — not now

F-Droid's main repo (`fdroiddata`) builds every app from source on its own
infrastructure, using pinned FOSS toolchains, and verifies the result against
a reproducible build. For an Expo/CNG app that means the build recipe would
need to:

- Provision a Node.js/bun toolchain in the F-Droid build environment. F-Droid's
  own writeup on this
  ([Adding React Native Apps to F-Droid](https://f-droid.org/2020/10/14/adding-react-native-app-to-f-droid.html))
  and the [Expo/React Native forum thread](https://forum.f-droid.org/t/expo-and-react-native-apps/701)
  both document this as an open, unresolved friction point for JS-toolchain
  apps generally — not something this project can fix unilaterally.
- Run `expo prebuild` inside that recipe (CNG's `android/` doesn't exist until
  generation time — there's no static native project to point a build recipe
  at).
- Pass F-Droid's dependency/library scanner. `expo-notifications`
  (docs/plans/0020, already shipped) bundles Firebase Cloud Messaging on
  Android for local scheduling — even though Shinobu never talks to a Firebase
  backend, the compiled APK still carries Firebase Analytics/Installations/Data
  Transport classes, which F-Droid and IzzyOnDroid's scanners both flag
  (confirmed against IzzyOnDroid's current scan categories, see below; F-Droid
  applies an equivalent non-free-component check for inclusion in the main
  repo). The named unblocker, if this is revisited: a gradle-level exclusion
  of the unused Firebase sub-modules (`packagingOptions`/dependency
  `exclude group:`), proven to still leave local notification scheduling
  working, before attempting a submission.
- Meet the reproducible-builds bar
  ([F-Droid Reproducible Builds docs](https://f-droid.org/en/docs/Reproducible_Builds/)),
  which is a real, currently-open problem area for anything with native code
  or embedded build paths — not specific to Shinobu, but not solved by
  anything in this plan either.

None of this is a hard blocker forever, but it's meaningful, ongoing
maintenance for a solo-maintained project with no backend team — verdict
stands: **defer**.

### IzzyOnDroid — primary target, submit after the first tagged release

IzzyOnDroid takes a fundamentally lighter path: it mirrors **official,
developer-signed APKs pulled directly from GitHub Releases** — no source
build, no reproducibility requirement. Current policy
([IzzyOnDroid App Inclusion Policy](https://izzyondroid.org/docs/general/AppInclusionPolicy/),
checked 2026-07-24):

- **License:** app and code must be FOSS, OSI/FSF-approved. GPL-3.0-only
  (`LICENSE`, R1) satisfies this.
- **Source:** GitHub tagged releases with attached APKs are an explicitly
  preferred/accepted source — exactly what `release.yml` produces (R6/R7).
- **Size:** a **~30 MB hard limit per APK** (with occasional exceptions,
  granted case by case). Measured against a real local debug-signed build:
  the **universal** APK (all four ABIs) is **~160 MB**; the **arm64-v8a**
  split (`-PreactNativeArchitectures=arm64-v8a`, KTD-3) — the realistic
  submission candidate — is **~67 MB**, still over 2× the limit. `unzip -l`
  on that arm64 build shows where it goes: ~52 MB across 6 `classes*.dex`
  files, ~30 MB of `lib/arm64-v8a/*.so` (Hermes, Cronet/nitro-fetch, Reanimated,
  the various Nitro modules), ~8 MB JS bundle, ~2 MB `resources.arsc`. The
  single biggest lever: **R8 minification and resource shrinking are
  currently off** — `android/app/build.gradle` reads
  `android.enableMinifyInReleaseBuilds` / `android.enableShrinkResourcesInReleaseBuilds`
  from gradle properties that this repo doesn't set, both defaulting to
  `false`. Turning those on (as `true` values, either in `android/gradle.properties`
  via an `expo-build-properties` config, or as `-P` flags in the release
  workflow) is the concrete, standard next step before a submission attempt —
  untested here, since it changes release-binary behavior and deserves its
  own verification pass, not a side effect of this CI/docs plan. **Do not
  submit until a real signed arm64 release build's measured size is actually
  under (or granted an exception against) 30 MB.**
- **Tracker/library scan:** IzzyOnDroid scans and lists libraries, ads, and
  analytics modules per-app, disclosed as AntiFeatures rather than an
  automatic hard rejection — but proprietary/non-free components are
  explicitly disallowed except when essential to core function. Expect
  Firebase Cloud Messaging classes (from `expo-notifications`) to surface in
  this scan; the same gradle-exclusion mitigation named for F-Droid above is
  the path to a clean scan if it's flagged as more than an AntiFeature note.
- **Submission is manual and owner-initiated** — via IzzyOnDroid's app-request
  process (Codeberg `IzzyOnDroid/repodata`, "New app inclusions" template),
  not an automated PR-able repo Shinobu's CI can push to.

**Izzy submission checklist (owner, after the first real tag):**

1. Confirm the tagged `shinobu-vX.Y.Z-arm64-v8a.apk` is under 30 MB (as
   measured, it currently isn't — do the R8/shrink-resources work above
   first, then re-measure).
2. Confirm `apksigner verify` on that APK shows your real upload certificate,
   not the debug one.
3. Open an app-request issue against IzzyOnDroid's `repodata` repo on
   Codeberg, using their app-request template — repo URL, package id
   (`xyz.glpecile.shinobu`), license (GPL-3.0-only), and a pointer to the
   GitHub Releases page as the APK source.
4. Expect a manual review pass (permissions, manifest, security/tracker scan)
   before the app is mirrored — this can take some back-and-forth over their
   issue tracker, not a fixed SLA.
5. Once listed, every subsequent tagged release with an arm64 APK attached is
   picked up automatically — no per-release resubmission.
