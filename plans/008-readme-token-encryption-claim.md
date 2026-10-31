# Plan 008: The README stops claiming tokens are encrypted

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- README.md src/state/session/tokens.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live files before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs (security claim)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

The public README tells users their tokens are encrypted on iOS and Android.
They aren't. The session store is created without an `encryptionKey`, and
encryption at rest is a pending todo. Users decide whether to connect five
trackers partly on that promise. The store also holds the user-entered Trakt
client secret and TMDB token. Making the README accurate costs one docs commit.

## Current state

`README.md` line ~32 (features list):

```md
- **No backend, no database.** Each tracker's token is its session. Tokens stay on your device, encrypted on iOS and Android. Nothing about you is stored anywhere else.
```

`README.md` line ~50 (tech-stack table, Nitro Modules row):

```md
| [Nitro Modules](https://nitro.margelo.com) | [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) stores tokens encrypted. [`react-native-nitro-fetch`](...) ... |
```

`src/state/session/tokens.ts:5-11`:

```ts
/**
 * Per-provider OAuth token persistence. MMKV is synchronous and universal
 * (localStorage fallback on web). Encryption at rest is deferred to todos/003
 * on purpose — don't add an encryptionKey here without doing that todo.
 */
const storage = createMMKV({ id: 'session' });
```

`AGENTS.md` (Tech stack) also states: "The session store currently has no
native `encryptionKey`; encryption at rest is deferred to
`todos/003-pending-p2-secure-token-storage.md`".

README voice: short declarative sentences, no marketing adjectives. Match it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check   | `grep -n "encrypted" README.md` | no line claims tokens are encrypted |

No build or test is needed. It's a docs-only change.

## Scope

**In scope**: `README.md` (the two lines above only).

**Out of scope**: `tokens.ts`, adding encryption (that's todos/003), AGENTS.md.

## Git workflow

- Branch: `docs/readme-token-storage`
- One commit: `docs(readme): describe token storage accurately`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite the features bullet

Replace the sentence "Tokens stay on your device, encrypted on iOS and Android."
with: "Tokens stay on your device, in app storage on iOS and Android and in the
browser's local storage on web. Encrypting them at rest is planned."
Keep the rest of the bullet.

**Verify**: `grep -n "encrypted on iOS" README.md` → no match.

### Step 2: Rewrite the tech-stack cell

Replace "`react-native-mmkv` stores tokens encrypted." with
"`react-native-mmkv` stores tokens and local state." Keep the rest of the cell.

**Verify**: `grep -n "stores tokens encrypted" README.md` → no match.

## Test plan

None. It's docs only.

## Done criteria

- [ ] Both greps above return no match
- [ ] `git diff --stat` shows only `README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

- `tokens.ts` now passes an `encryptionKey` (todos/003 landed). Then the claim
  may be true for native. Report back instead of editing.

## Maintenance notes

- When todos/003 lands, restore a precise claim (native only, unless web
  storage changes too).
