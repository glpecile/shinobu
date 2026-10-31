# Plan 015: Workflows pin their actions and Bun, and the release job keeps secrets narrow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- .github/workflows package.json`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (the release workflow only fully runs on a tag push; a mistake shows up at release time)
- **Depends on**: none
- **Category**: security + dx
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

The release job decodes the Android upload keystore and its passwords, and it
holds a `contents: write` token. In the same job it runs third-party code:
`bun install` scripts, Expo config plugins, Gradle plugins, and the
`oven-sh/setup-bun@v2` action pinned only by a mutable tag. Today:

- Every action except `gradle/actions/setup-gradle` is pinned by tag. A
  retagged or compromised action runs with the signing material present.
- `actions/checkout` persists the write token into `.git/config`, so any
  later step can read it.
- The keystore passwords go into `$GITHUB_ENV` **before** `expo prebuild`, so
  prebuild's plugins and every later step inherit them.
- `ALL_SECRETS: ${{ toJSON(secrets) }}` exposes *every* repository secret to
  one step just to copy the `EXPO_PUBLIC_*` ones. Any future secret named
  `EXPO_PUBLIC_…` by mistake would ship inside the public APK.
- Secrets and `github.ref_name` are expanded straight into `run:` shell text.
- No workflow pins Bun. CI installs whatever Bun is latest, while
  `bun test --isolate` and `bun.lock` depend on the Bun version.
- `ci.yml` and `link-health.yml` declare no `permissions:` and inherit the repo default.

A stolen upload key would let an attacker ship APKs that install as updates
over users' Shinobu. Each fix here is mechanical.

## Current state

Action references (`grep -n "uses:" .github/workflows/*.yml`):

```
android-warm.yml:54  actions/checkout@v4
android-warm.yml:56  oven-sh/setup-bun@v2
android-warm.yml:59  actions/setup-java@v4
android-warm.yml:81  actions/cache@v4
android-warm.yml:100 gradle/actions/setup-gradle@3f131e8634966bd73d06cc69884922b02e6faf92 # v6.2.0   ← the pattern to copy
ci.yml:20            actions/checkout@v4
ci.yml:21            actions/setup-node@v4
ci.yml:24            oven-sh/setup-bun@v2
link-health.yml:23   actions/checkout@v4
link-health.yml:24   oven-sh/setup-bun@v2
release.yml:38       actions/checkout@v4
release.yml:40       oven-sh/setup-bun@v2
release.yml:43       actions/setup-java@v4
release.yml:126      actions/cache/restore@v4
release.yml:144      gradle/actions/setup-gradle@3f131e8… # v6.2.0
release.yml:183      actions/upload-artifact@v4
```

`release.yml` today (excerpts, in file order):

```yaml
permissions:
  contents: write
...
      - name: Verify tag matches expo.version
        if: github.event_name == 'push'
        run: |
          if [ "${{ github.ref_name }}" != "v${{ steps.version.outputs.value }}" ]; then
...
      - name: Determine signing mode
        id: signing
        run: |
          if [ -n "${{ secrets.SHINOBU_KEYSTORE_BASE64 }}" ]; then
...
      - name: Decode release keystore
        if: steps.signing.outputs.signed == 'true'
        run: echo "${{ secrets.SHINOBU_KEYSTORE_BASE64 }}" | base64 -d > "$RUNNER_TEMP/release.keystore"

      # Only set when signed — leaving these unset (rather than set-but-empty)
      # is what makes `plugins/with-release-signing.js`'s
      # `project.hasProperty(...)` fallback to debug signing actually fire.
      - name: Configure release signing properties
        if: steps.signing.outputs.signed == 'true'
        run: |
          {
            echo "ORG_GRADLE_PROJECT_SHINOBU_UPLOAD_STORE_FILE=$RUNNER_TEMP/release.keystore"
            echo "ORG_GRADLE_PROJECT_SHINOBU_UPLOAD_STORE_PASSWORD=${{ secrets.SHINOBU_UPLOAD_STORE_PASSWORD }}"
            echo "ORG_GRADLE_PROJECT_SHINOBU_UPLOAD_KEY_ALIAS=${{ secrets.SHINOBU_UPLOAD_KEY_ALIAS }}"
            echo "ORG_GRADLE_PROJECT_SHINOBU_UPLOAD_KEY_PASSWORD=${{ secrets.SHINOBU_UPLOAD_KEY_PASSWORD }}"
          } >> "$GITHUB_ENV"

      - name: Write provider credentials
        env:
          ALL_SECRETS: ${{ toJSON(secrets) }}
        run: |
          jq -r 'to_entries[]
            | select(.key | startswith("EXPO_PUBLIC_"))
            | "\(.key)=\(.value)"' <<<"$ALL_SECRETS" > .env.local

      - name: Prebuild Android project
        run: bunx expo prebuild --platform android
      ... (ccache, Set up Gradle) ...
      - name: Build universal release APK          ← first Gradle step
      ...
      - name: Create/update GitHub Release
        if: github.event_name == 'push'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${{ github.ref_name }}"
```

The `EXPO_PUBLIC_*` variables the app reads (from `.env.template`):
`EXPO_PUBLIC_SIMKL_CLIENT_ID`, `EXPO_PUBLIC_ANILIST_CLIENT_ID`,
`EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID`, `EXPO_PUBLIC_TMDB_TOKEN`. Confirm the
list with `grep -rhoE "EXPO_PUBLIC_[A-Z_]+" src | sort -u`.

`android-warm.yml` already sets `permissions: contents: read` with a comment.
Copy that style.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Resolve a tag to a SHA | `git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<tag>' 'refs/tags/<tag>^{}'` | a 40-char SHA; prefer the `^{}` (peeled) line when present |
| YAML parses | `bunx --bun yaml-lint .github/workflows/*.yml` or `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml` | exit 0 |
| Optional lint | `bunx actionlint` if available (download if your environment allows) | no errors |
| Unit checks | `bun install --frozen-lockfile && bun run test` | all pass (Bun pin sanity) |

## Scope

**In scope**: `.github/workflows/ci.yml`, `release.yml`, `android-warm.yml`,
`link-health.yml`, `pr-labels.yml` (pin only), and `package.json` (add `packageManager`).

**Out of scope**:
- The build commands, cache keys and ccache settings.
- `plugins/with-release-signing.js`.
- Splitting the release job into build and publish jobs (see maintenance notes).
- Adding Dependabot or Renovate (recommend it in your report; don't add it here).

## Git workflow

- Branch: `ci/harden-workflows`
- Commits: `ci: pin actions and bun by version`, `ci(release): narrow signing secrets and token exposure`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin Bun

- Run `bun --version` in your environment, after `bun install` and
  `bun run test` pass with it. Add `"packageManager": "bun@<that version>"` to
  `package.json` (top level, after `"private"`).
- In every `oven-sh/setup-bun` step, add `with: { bun-version-file: package.json }`
  (block style, matching the file).

**Verify**: `grep -n "bun-version-file" .github/workflows/*.yml` → one per setup-bun step (5).

### Step 2: Pin every action by SHA

For each `uses:` at a tag (list above, including `pr-labels.yml` if it has
any), resolve the **current** commit of that tag with `git ls-remote` and
rewrite it as `owner/repo@<sha> # vX` (or `# vX.Y.Z` if you resolve an exact
release tag; prefer the exact tag the major currently points to). For
sub-actions like `actions/cache/restore`, resolve `actions/cache` and keep the
`/restore` path: `actions/cache/restore@<sha> # v4.x.y`.

**Verify**: `grep -nE "uses: [^ ]+@v[0-9]" .github/workflows/*.yml` → no matches.

### Step 3: Least-privilege tokens

- Add `permissions:\n  contents: read` at the top level of `ci.yml` and
  `link-health.yml`, with a one-line comment like android-warm's.
- In **every** `actions/checkout` step across the workflows, add
  `with:\n  persist-credentials: false`. Nothing pushes from CI. The release
  publish step authenticates through `GH_TOKEN`, not git config.

**Verify**: `grep -c "persist-credentials: false" .github/workflows/*.yml` → one per checkout.

### Step 4: Release — explicit public credentials

Replace the "Write provider credentials" step with an explicit list that
still writes **no line** for a missing secret:

```yaml
      - name: Write provider credentials
        env:
          EXPO_PUBLIC_SIMKL_CLIENT_ID: ${{ secrets.EXPO_PUBLIC_SIMKL_CLIENT_ID }}
          EXPO_PUBLIC_ANILIST_CLIENT_ID: ${{ secrets.EXPO_PUBLIC_ANILIST_CLIENT_ID }}
          EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID: ${{ secrets.EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID }}
          EXPO_PUBLIC_TMDB_TOKEN: ${{ secrets.EXPO_PUBLIC_TMDB_TOKEN }}
        run: |
          : > .env.local
          for name in EXPO_PUBLIC_SIMKL_CLIENT_ID EXPO_PUBLIC_ANILIST_CLIENT_ID EXPO_PUBLIC_ANILIST_NATIVE_CLIENT_ID EXPO_PUBLIC_TMDB_TOKEN; do
            if [ -n "${!name}" ]; then printf '%s=%s\n' "$name" "${!name}" >> .env.local; fi
          done
```

Update the comment above the step. Shipping a new credential is now a workflow
edit on purpose, because whatever goes in here is baked into a public APK.

**Verify**: `grep -n "toJSON(secrets)" .github/workflows/release.yml` → no match.

### Step 5: Release — signing material only where Gradle runs

- **Move** the "Decode release keystore" and "Configure release signing
  properties" steps (same `if:` conditions, same order) to sit **immediately
  before** "Build universal release APK", i.e. after "Set up Gradle". Prebuild
  and `bun install` then run without them. Keep the "Only set when signed…"
  comment with the step.
- Pass secrets through `env:` instead of expanding them in shell text:
  - "Determine signing mode": `env: { KEYSTORE: ${{ secrets.SHINOBU_KEYSTORE_BASE64 }} }`
    and test `if [ -n "$KEYSTORE" ]`.
  - "Decode release keystore": same `env`, then `printf '%s' "$KEYSTORE" | base64 -d > "$RUNNER_TEMP/release.keystore"`.
  - "Configure release signing properties": put the three password/alias
    secrets in `env:` (`STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) and echo
    `"...=$STORE_PASSWORD"` etc. into `$GITHUB_ENV`.
- Replace `${{ github.ref_name }}` inside `run:` scripts with `"$GITHUB_REF_NAME"`.
  The runner sets it as a default env var. Do this in "Verify tag matches
  expo.version" and "Create/update GitHub Release".

**Verify**: `grep -nE 'run:.*\$\{\{ (secrets|github\.ref_name)' .github/workflows/release.yml` → no match,
and `grep -n '\${{ secrets\.' .github/workflows/release.yml` shows secrets only on `env:` lines.
YAML parses (command table).

### Step 6: Dry-run the release if you can

If the operator allows it, trigger `release.yml` with `workflow_dispatch` on
your branch. It runs unsigned or signed depending on secrets and never
publishes. Expect two APK artifacts. If you can't trigger workflows, say so in
the report. The operator must dry-run before the next tag.

**Verify**: the run is green, or a note says it wasn't possible.

## Test plan

- No unit tests. Verification is the greps, YAML parsing and a
  `workflow_dispatch` dry run.
- `bun run test` passes locally with the pinned Bun version.

## Done criteria

- [ ] No `uses: …@vN` tag references remain
- [ ] Every setup-bun step has `bun-version-file: package.json`; `package.json` has `packageManager`
- [ ] Every checkout has `persist-credentials: false`
- [ ] `ci.yml` and `link-health.yml` have `permissions: contents: read`
- [ ] No `toJSON(secrets)`; no `${{ secrets.* }}` or `${{ github.ref_name }}` inside `run:` text
- [ ] Signing steps sit after "Set up Gradle"
- [ ] `plans/README.md` status row updated

## STOP conditions

- `git ls-remote` can't reach GitHub from your environment (you can't resolve
  SHAs). Do steps 1, 3, 4 and 5, and report step 2 as blocked.
- `plugins/with-release-signing.js` reads the signing properties at prebuild
  time, not Gradle time. Check by reading the plugin before step 5. If it
  does, the move breaks signing: keep the steps where they are and report.
- `pr-labels.yml` uses `pull_request_target` (it shouldn't). Report it; don't fix it here.

## Maintenance notes

- SHA pins need bumping. Recommend the owner enable Dependabot for
  `github-actions`; it updates SHA pins and keeps the `# vX` comments.
- A stronger follow-up: build in a job with `contents: read`, upload the APKs,
  and publish from a second job that alone has `contents: write`. It was
  deferred because only a tag push exercises the publish path.
- When a new `EXPO_PUBLIC_*` credential is added to the app, add it to step 4's
  list and to `.env.template`.
