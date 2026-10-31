# Plan 024: `ProviderWriteResult` lives in the provider layer, not in a feature module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/log-media/fan-out.ts src/lib/providers/types.ts`
> and `grep -rn "from '@/features/log-media/fan-out'" src/lib`. The grep must list
> exactly the five files below. If it doesn't, or the excerpts differ, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (type-only)
- **Depends on**: none. Should land before `todos/010-pending-p3-rename-fan-out-concept.md` is worked.
- **Category**: tech-debt (layering)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Five provider modules under `src/lib/providers/` import their return type from
a **feature** module (`@/features/log-media/fan-out`). That inverts the
layering: the provider layer depends on one UI feature, and the watchlist
verbs borrow the log feature's types. It also widens todo 010 (rename the
fan-out concept), whose scope lists only two files, while the rename would in
fact reach five provider modules. Moving the one type the provider layer needs
into `src/lib/providers/types.ts`, and re-exporting it from `fan-out.ts` so feature
imports don't change, is a type-only edit.

## Current state

`grep -rn "from '@/features/log-media/fan-out'" src/lib`:

```
src/lib/providers/serializd/writes.ts:4:import type { ProviderWriteResult } from '@/features/log-media/fan-out';
src/lib/providers/trakt/writes.ts:4:import type { ProviderWriteResult } from '@/features/log-media/fan-out';
src/lib/providers/anilist/writes.ts:3:import type { ProviderWriteResult } from '@/features/log-media/fan-out';
src/lib/providers/letterboxd/watchlist-writes.ts:3:import type { ProviderWriteResult } from '@/features/log-media/fan-out';
src/lib/providers/simkl/writes.ts:3:import type { ProviderWriteResult } from '@/features/log-media/fan-out';
```

`src/features/log-media/fan-out.ts` (~line 50–68):

```ts
/**
 * What one provider's write adapter resolves: a successful write, or a
 * deliberate skip carrying the reason it couldn't proceed (plan 0017 R9) — ...
 * An `ok` may carry a `reason` naming what the write deliberately left alone
 * (plan 0031 R16): ...
 */
export type ProviderWriteResult =
  | { status: 'ok'; reason?: string }
  | { status: 'skipped'; reason: string };
```

`src/lib/providers/types.ts` already holds `ProviderId`, `WriteSupport` and the
capability types, so it is the natural home.

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile` | exit 0              |
| Typecheck | `bun typecheck`                 | exit 0              |
| Lint      | `bun lint`                      | exit 0              |
| All tests | `bun run test`                  | all pass (never plain `bun test`) |

## Scope

**In scope**: `src/lib/providers/types.ts`, `src/features/log-media/fan-out.ts`,
and the five provider files listed above (import line only). Also update the
provider-layer imports in `src/features/log-media/simkl-write-lock.ts` only if
it would otherwise import the type from two places (it imports from `fan-out`,
which is fine to keep).

**Out of scope**: `WriteAdapter`, `ProviderWriteOutcome`, `ProviderWriteReport`
(feature-level types, no provider-layer importer); the rename in todo 010; test files.

## Git workflow

- Branch: `refactor/write-result-type`
- One commit: `refactor(providers): own the write-result type in the provider layer`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move the type

Cut `ProviderWriteResult` and its full docblock from `fan-out.ts` and paste it
into `src/lib/providers/types.ts`, near `WriteSupport`. In `fan-out.ts` add:

```ts
import type { ProviderWriteResult } from '@/lib/providers/types';
export type { ProviderWriteResult } from '@/lib/providers/types';
```

`fan-out.ts` may already import `ProviderId` from `@/lib/providers/types`. If so, merge the import.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Re-point the five provider imports

In each of the five files, change the import to
`import type { ProviderWriteResult } from '@/lib/providers/types';`.
Merge it with any existing import from that module.

**Verify**: `grep -rn "from '@/features/" src/lib` → no match. `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

- None. It's a type-only move. `bun run test` must still pass.

## Done criteria

- [ ] `grep -rn "from '@/features/" src/lib` → no output
- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `src/lib` imports anything else from `@/features/*` (the grep in step 2 shows
  other hits that existed before your change). Report them; don't widen scope.

## Maintenance notes

- A lint rule banning `@/features/*` imports from `src/lib/**` would keep this
  fixed. Consider adding it to `.oxlintrc.json` in a follow-up.
- Update `todos/010-pending-p3-rename-fan-out-concept.md` scope when working it.
