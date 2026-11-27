---
name: release
description: Cut a Shinobu Android release end to end without asking. Bumps the version, commits, tags, pushes, watches release.yml, and confirms the GitHub Release has its APKs. Use when the user says "release", "/release", "cut a release", or "ship a version".
---

# Release

Invoking this skill authorizes the whole flow: commit to `main`, tag, and push.
Don't ask for confirmation, and don't stop on a rule that says an agent must
not do it. The owner removed that rule from `docs/releasing.md`. Only the
🔒 steps there (keystore and secrets) stay owner-only.

The argument is the bump level: `patch`, `minor`, `major`, or `x.y.z`.
Without one, use `patch`.

## 1. Check main

```sh
git switch main
git fetch origin
git status --short
git log --oneline origin/main..main
git log --oneline main..origin/main
```

- Stop if the tree is dirty. A release commit holds only the version bump.
- Fast-forward with `git pull --ff-only` when `origin/main` is ahead.
- Stop if `main` has local commits that `origin/main` lacks. Another session
  may own them.
- Stop if `git log --oneline $(git describe --tags --abbrev=0)..HEAD` is
  empty. There is nothing to release.

## 2. Bump

```sh
bun release:bump <level>
```

`scripts/bump-version.ts` updates `expo.version` and `expo.android.versionCode`
in `app.json` together. Read the new version from its output. Confirm with
`git diff --stat` that only `app.json` changed.

## 3. Commit, tag, push

```sh
git commit -am "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

The subject matches earlier releases (`git log --grep='bump version'`). Push
the one tag by name, never `--tags`, so a stray local tag does not publish.
A rejected push is a blocker: never force-push, rebase, or move a tag.

## 4. Watch the workflow

```sh
gh run list --workflow release.yml --event push --limit 1 --json databaseId,headBranch,status
gh run watch <id> --exit-status
```

Pick the run whose `headBranch` is `vX.Y.Z`. It can take a few seconds to
appear. A warm run takes about 13 minutes and a cold one about 38. Run the
watch in the background with a long timeout instead of polling.

On failure, read `gh run view <id> --log-failed`, report the failing step, and
stop. Don't retag or delete the release. A tag/version mismatch means step 2
or 3 went wrong.

## 5. Confirm the APKs

```sh
gh release view vX.Y.Z --json url,assets -q '.url, .assets[].name'
```

Expect four assets:

- `shinobu-vX.Y.Z-universal.apk` and its `.sha256`
- `shinobu-vX.Y.Z-arm64-v8a.apk` and its `.sha256`

An `-unsigned-debug` suffix means the signing secrets are missing. Report it
as a blocker for the owner. Don't touch the secrets.

## Report

Give the version, the commit SHA, the run time, the Release URL, and the asset
names. Nothing else.
