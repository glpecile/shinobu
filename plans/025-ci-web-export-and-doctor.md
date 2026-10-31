# Plan 025: CI checks the static web export and Expo's dependency health on every PR

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- .github/workflows/ci.yml package.json`
> If plan 015 has landed, `ci.yml` will have SHA-pinned actions,
> `persist-credentials: false`, `permissions` and `bun-version-file`. That is
> expected: copy that shape. Any other difference is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (a separate job; existing checks are untouched)
- **Depends on**: plans/015-harden-github-workflows.md (same file; land 015 first so the new job copies its pins)
- **Category**: dx
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

CI runs lint, typecheck and unit tests only. The web app is a static
pre-render (`expo export --platform web`), and web deploys are manual
(`bun run deploy:web`), so a change that breaks the pre-render first shows up
when the owner deploys. That has happened before:
`docs/solutions/uniwind-classname-undefined-throws.md` ("crashes the web build")
and `docs/solutions/web-prerender-bakes-js-resolved-colors.md`. Separately,
`package.json` configures `expo.doctor`, and the last audit ran Expo's
dependency check by hand. The most recent commit is an SDK patch bump, which
is exactly what the doctor checks. Running both in CI catches these regressions on the PR.

## Current state

`.github/workflows/ci.yml` (before plan 015):

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun lint
      - run: bun typecheck
      - run: bun run test
```

The file's header comment explains that network-dependent link checks are
deliberately **not** in this workflow. Expo doctor queries Expo's version API
over the network, so it gets its own job and `continue-on-error` (see step 2).

`package.json`:

```json
    "build:web": "expo export --platform web --clear --max-workers 2 && cp 'dist/+not-found.html' dist/404.html",
  ...
  "expo": {
    "doctor": {
      "reactNativeDirectoryCheck": { "exclude": ["react-native-nitro-fetch"], "listUnknownPackages": false }
    }
  },
```

All `EXPO_PUBLIC_*` variables are optional (`.env.template`), so the export
must succeed without any secrets.

## Commands you will need

| Purpose     | Command                          | Expected on success |
|-------------|----------------------------------|---------------------|
| Install     | `bun install --frozen-lockfile`  | exit 0              |
| Web export  | `bun run build:web`              | exit 0, `dist/index.html` exists |
| Doctor      | `bunx expo-doctor`               | exit 0, or a list of findings |
| YAML parses | `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` | exit 0 |

## Scope

**In scope**: `.github/workflows/ci.yml`.

**Out of scope**: the existing `checks` job, `package.json` scripts, deploy automation.

## Git workflow

- Branch: `ci/web-export-doctor`
- One commit: `ci: build the web export and run expo-doctor on PRs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prove both commands locally

Run `bun run build:web` and then `bunx expo-doctor`, and record the duration
of each in your report. If doctor reports failures **today** on `main`, STOP
(see STOP conditions). The job would be red from day one.

**Verify**: `bun run build:web` exit 0 and `test -f dist/index.html && echo ok` → `ok`.

### Step 2: Add two jobs

Add, beside `checks`, using the same setup steps as `checks` (copy the pinned
`uses:` lines exactly as they are in the file at that point):

```yaml
  web-export:
    runs-on: ubuntu-latest
    steps:
      # same checkout / setup-node / setup-bun steps as `checks`
      - run: bun install --frozen-lockfile
      # The static pre-render is the web app; deploys are manual, so this is
      # the only place a pre-render crash is caught before release.
      - run: bun run build:web

  expo-doctor:
    runs-on: ubuntu-latest
    # Queries Expo's version API, so it can fail for network reasons; it
    # reports on PRs without blocking them (same reasoning as link-health.yml).
    continue-on-error: true
    steps:
      # same setup steps
      - run: bun install --frozen-lockfile
      - run: bunx expo-doctor
```

Extend the header comment's first sentence to mention the web export, and add
that doctor is advisory.

**Verify**: YAML parses (command table). `grep -n "web-export:\|expo-doctor:" .github/workflows/ci.yml` → 2 matches.

## Test plan

- No unit tests. Verify locally (step 1) and, if the operator allows a push, on the PR's CI run.

## Done criteria

- [ ] `ci.yml` has `web-export` and `expo-doctor` jobs; `checks` is unchanged
- [ ] `bun run build:web` passed locally (duration recorded)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bunx expo-doctor` fails on the current `main`. Report the findings instead
  of adding a job that starts red. The owner decides whether to fix the
  findings or exclude them in `package.json` `expo.doctor`.
- `bun run build:web` needs a secret or network access to a provider to succeed.
- The export takes more than ~10 minutes in your environment. Report it, since that may be too slow for every PR.

## Maintenance notes

- If web deploys move to CI later (Workers Builds), reuse this job's artifact instead of exporting twice.
