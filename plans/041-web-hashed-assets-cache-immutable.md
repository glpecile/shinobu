# Plan 041: Hashed web assets are cached as immutable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- public/_headers wrangler.jsonc`
> If either file changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

The web app is a static Expo export served by Cloudflare Workers static assets.
Every file under `/_expo/static/` has a content hash in its name, but the live
site serves them with `cache-control: public, max-age=0, must-revalidate` (the
Cloudflare default). On every repeat visit the browser revalidates each script
and stylesheet (about 10 conditional requests, 1.36 MB of JS behind them)
before the app can start. A long immutable lifetime removes those round trips.

## Current state

`public/_headers` (copied to `dist/` by the export, read by Cloudflare):

```
# Cloudflare reads these static-asset headers from the dist root.
/*
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=15552000
```

`wrangler.jsonc` lists `run_worker_first` routes (`/api/*`, `/og/*`,
`/details/*`, ...). `/_expo/*` is not in that list, so `_headers` rules apply
to it.

Cloudflare `_headers` rules: a path block is a URL pattern line followed by
indented `Name: value` lines. A request that matches several blocks gets the
headers of all of them.

## Commands you will need

| Purpose | Command                                   | Expected on success |
| ------- | ----------------------------------------- | ------------------- |
| Check   | `grep -n -A1 '^/_expo/static/\*' public/_headers` | the new block |
| Tests   | `bun test --isolate worker`               | all pass            |

## Scope

**In scope**: `public/_headers` only.

**Out of scope** (do NOT touch):

- `/fonts/*`, `/splash-icon.png`, HTML files and any other unhashed path. An
  immutable lifetime on an unhashed file would pin a stale copy for a year.
- `wrangler.jsonc`, `worker/*`.
- The existing `/*` block. Do not reorder or edit its headers.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(web): cache hashed export assets as immutable`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push, do NOT deploy, do NOT run `bun run build:web` or `wrangler`.

## Steps

### Step 1: Add the block

Append to `public/_headers`, after one blank line:

```
# Export file names carry a content hash, so a cached copy never goes stale.
/_expo/static/*
  Cache-Control: public, max-age=31536000, immutable
```

**Verify**: `grep -c 'immutable' public/_headers` → `1`, and
`grep -n -B1 'immutable' public/_headers` shows `/_expo/static/*` on the line
before the header.

### Step 2: Confirm nothing else reads the file

**Verify**: `grep -rn "_headers" worker scripts src --include='*.ts' --include='*.tsx' | head` →
no test or script asserts the exact content of `_headers`. If one does, update
only its expected value. If that file is outside `public/`, STOP.

**Verify**: `bun test --isolate worker` → all pass.

## Test plan

No test. A header file has no unit under test in this repo. The reviewer checks
the live header after the next deploy with
`curl -sI https://<host>/_expo/static/js/web/<file>.js | grep -i cache-control`.

## Done criteria

- [ ] `public/_headers` has exactly one new block, for `/_expo/static/*`, with `Cache-Control: public, max-age=31536000, immutable`
- [ ] The `/*` block is byte-for-byte unchanged (`git diff` shows only added lines)
- [ ] `git diff --name-only HEAD~1` lists only `public/_headers`

## STOP conditions

- `public/_headers` does not match "Current state".
- You find that the export writes unhashed files under `/_expo/static/`
  (check: `ls dist/_expo/static/js/web 2>/dev/null | head` if a `dist/` exists;
  every name must end in `-<hash>.js`). If `dist/` does not exist, skip this
  check and say so in your report.

## Maintenance notes

- If the export ever writes an unhashed file under `/_expo/static/`, this rule
  must be narrowed.
- Deferred: a short `max-age` for `/fonts/*` and the splash image. They are
  unhashed, so that needs an owner decision.
