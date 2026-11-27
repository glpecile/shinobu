---
name: release
description: Cut a Shinobu Android release end to end without asking. Bumps the version, commits, tags, pushes, watches release.yml, and confirms the GitHub Release has its APKs. Use when the user says "release", "/release", "cut a release", or "ship a version".
---

# Release

This skill authorizes a commit to `main`, a tag, and a push. Don't ask, and
don't stop on a rule that says an agent must not tag. Only the 🔒 keystore and
secrets steps in `docs/releasing.md` stay owner-only.

The argument is `patch`, `minor`, `major`, or `x.y.z`. The default is `patch`.

## 1. Check main

```sh
git status --short
git switch main
git pull --ff-only
git log --oneline origin/main..main
git log --oneline $(git describe --tags --abbrev=0 --match 'v*')..HEAD
```

Stop if the tree is dirty, the pull fails, `main` has commits that
`origin/main` lacks, or there are no commits since the last tag.

## 2. Bump

```sh
bun release:bump <level>
git diff --stat
```

Only `app.json` changes. The script prints the new version.

## 3. Commit, tag, push

```sh
git commit -am "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push --atomic origin main vX.Y.Z
```

`--atomic` keeps a rejected `main` from publishing the tag alone. Never push
`--tags`, force-push, rebase, or move a tag. A rejected push is a blocker.

## 4. Watch the workflow

```sh
gh run list --workflow release.yml --branch vX.Y.Z --json databaseId,status
gh run watch <id> --exit-status
```

The run can take a few seconds to appear. A warm run takes about 13 minutes and
a cold one about 38, so watch in the background with a long timeout. On
failure, report the step from `gh run view <id> --log-failed` and stop. Don't
retag or delete the release.

## 5. Confirm the APKs

```sh
gh release view vX.Y.Z --json url,assets -q '.url, .assets[].name'
```

Expect `shinobu-vX.Y.Z-{universal,arm64-v8a}.apk` and their `.sha256` files.
An `-unsigned-debug` suffix means the signing secrets are missing. Report it to
the owner as a blocker.

## Report

Give the version, the commit SHA, the run time, the Release URL, and the asset
names.
