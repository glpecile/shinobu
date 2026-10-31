# Plan 005: A provider whose watch state can't be read no longer blocks rewatches elsewhere

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/log-media/use-log-media.ts src/features/log-media/use-log-media.test.ts src/features/log-media/reconcile.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Shinobu writes one log to every connected provider that handles the item. Before
writing, `planLogWrite` asks each provider "do you already have this watch?" and
applies the sync rule in `reconcile.ts`. If **any** provider says no, the
providers that said yes are *skipped* (catch-up). If **all** say yes, the log is
a rewatch and every provider gets a new play.

Simkl has no branch in `providerHasWatch`, so it always answers "no". Simkl
handles movies, TV and anime, so it is a target in almost every log. With Simkl
connected, a real rewatch can never happen: Trakt, AniList, Letterboxd and
Serializd are all *skipped* ("already had this logged"), and only Simkl gets a
write. The UI explicitly offers "Log rewatch". After this plan, a provider whose
state can't be read is left out of the parity decision (like a mapping-skipped
provider already is) and is still always written.

## Current state

- `src/features/log-media/use-log-media.ts` — `providerHasWatch` (~line 536)
  and `planLogWrite` (~line 820).
- `src/features/log-media/reconcile.ts` — the pure rule `reconcileLogTargets`. Do not change it.
- `src/features/log-media/use-log-media.test.ts` — decision-layer tests for `planLogWrite`.

`providerHasWatch` today (abridged):

```ts
async function providerHasWatch(
  queryClient: QueryClient,
  provider: ProviderId,
  item: NormalizedMediaItem,
  domains: LogDomains,
): Promise<boolean> {
  const episodes = domains.canonical;
  try {
    switch (provider) {
      case 'trakt': { ... }
      case 'anilist': { ... }
      case 'serializd': { ... }
      case 'letterboxd': { ... }
    }
  } catch {
    return false;
  }
  // Providers without a branch fall through to the conservative default:
  // Simkl — readable since plan 0034 U7 — deliberately has no branch yet, ...
  // Deferred to follow-up (plan 0034 Scope Boundaries); until then both count
  // as "doesn't have it", so the write (the user's actual intent) always
  // fires.
  return false;
}
```

`planLogWrite` today (abridged):

```ts
  const reconcileTargets = targets.filter((provider) => !mappingSkips.has(provider));
  const records: ProviderWatchRecord[] = await Promise.all(
    reconcileTargets.map(async (provider) => ({
      provider,
      hasIt: await providerHasWatch(queryClient, provider, item, domains),
    })),
  );
  const decisions = reconcileLogTargets(records);
  const skipped = decisions
    .filter((decision) => decision.action === 'skip')
    .map((decision) => decision.provider);
  const writeTargets = targets.filter((provider) => !skipped.includes(provider));
  const rewatch =
    decisions.length > 0 && decisions.every((decision) => decision.action === 'rewatch');
```

`reconcile.ts`:

```ts
export function reconcileLogTargets(records: readonly ProviderWatchRecord[]): LogDecision[] {
  const anyMissing = records.some((record) => !record.hasIt);
  return records.map((record) => ({
    provider: record.provider,
    action: anyMissing ? (record.hasIt ? 'skip' : 'log') : 'rewatch',
  }));
}
```

The precedent to follow: a mapping-skipped provider is already excluded from
the records and stays in `writeTargets`. The test
`'an unmappable batch with AniList at parity still rewatches AniList alone'`
in `use-log-media.test.ts` pins that behaviour.

Important distinction — keep it: the `catch { return false; }` for a **failed
read** must stay `false`. If a read fails, today the provider is written and
the others with the watch are skipped; changing that to "unknown" would turn
the others into a rewatch (a double log). Only the **no branch** fall-through
becomes "unknown".

Conventions: dispatch on provider stays inside the existing `switch`
(AGENTS.md: "Use `switch` when dispatching several cases of the same value").
Never branch on a provider id outside it.

## Commands you will need

| Purpose   | Command                                                   | Expected on success |
|-----------|-----------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                           | exit 0              |
| Typecheck | `bun typecheck`                                           | exit 0              |
| One file  | `bun test src/features/log-media/use-log-media.test.ts`   | all pass            |
| All tests | `bun run test`                                            | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                | exit 0              |

## Scope

**In scope**:
- `src/features/log-media/use-log-media.ts` — `providerHasWatch` and `planLogWrite` only
- `src/features/log-media/use-log-media.test.ts`

**Out of scope** (do NOT touch):
- `src/features/log-media/reconcile.ts` and its tests — the rule is correct.
- Adding a real Simkl reconcile read. The fall-through comment explains why it
  is deferred (heavy read, numbering domains). This plan only stops the
  missing read from poisoning the others.
- The `catch` branch in `providerHasWatch` (see "Important distinction").

## Git workflow

- Branch: `fix/simkl-reconcile-rewatch`
- One commit, e.g. `fix(log): keep unreadable providers out of the rewatch decision`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Return "unknown" from the fall-through

Change `providerHasWatch`'s return type to `Promise<boolean | null>`. Replace
the final `return false;` with `return null;`. Rewrite the comment above it so
it says: providers with no branch (Simkl) can't be read yet, so they answer
`null` — "unknown" — and `planLogWrite` leaves them out of the parity decision
and always writes them. Keep the sentences explaining why the Simkl read is
deferred. Leave `catch { return false; }` as it is.

**Verify**: `bun typecheck` → fails only in `planLogWrite` (the `hasIt` field
now receives `boolean | null`). That is expected; fix it in step 2.

### Step 2: Leave unknown providers out of the records

In `planLogWrite`, build the records, then drop the `null` answers before
calling `reconcileLogTargets`:

```ts
  const answers = await Promise.all(
    reconcileTargets.map(async (provider) => ({
      provider,
      hasIt: await providerHasWatch(queryClient, provider, item, domains),
    })),
  );
  // A provider that can't report its state (null) is written but has no say
  // in catch-up vs. rewatch, like a mapping-skipped provider above.
  const records: ProviderWatchRecord[] = answers.flatMap(({ provider, hasIt }) =>
    hasIt == null ? [] : [{ provider, hasIt }],
  );
```

Everything after (`decisions`, `skipped`, `writeTargets`, `rewatch`) stays the
same: an unknown provider is never in `skipped`, so it stays in `writeTargets`.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Pin the regression

In `use-log-media.test.ts`, add one test to the
`describe('planLogWrite — reconcile across both domains (plan 0027 U4)')`
block (or a new `describe` right after it). It must use a **movie** (no
episode mapping involved):

- Build a `MOVIE` `NormalizedMediaItem` with `externalIds: { trakt: 1, tmdb: 27205 }`.
- Seed Trakt's watched movies so Trakt "has it":
  `queryClient.setQueryData(traktQueryKeys.watchedMovies(), [item])`
  (`traktQueryKeys` is already imported in this file).
- `const plan = await planLogWrite(queryClient, { item }, ['trakt', 'simkl']);`
- Expect `plan.rewatch` to be `true`, `plan.skipped` to equal `[]`, and
  `plan.writeTargets` to equal `['trakt', 'simkl']`.

Before step 2 this test would have produced `rewatch: false` and
`skipped: ['trakt']`. If you want to confirm, run it with step 2 reverted
(`git stash`), then restore.

**Verify**: `bun test src/features/log-media/use-log-media.test.ts` → all pass,
including the new test.

## Test plan

- One new case: Trakt at parity + Simkl unknown → rewatch on both, nothing skipped.
- Existing cases must still pass unchanged, especially
  `'an unmappable batch with AniList at parity still rewatches AniList alone'`
  and `'a translation miss skips Trakt with a reason while Simkl still writes the entry batch'`.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0 with the new case
- [ ] `grep -n "return null;" src/features/log-media/use-log-media.ts` shows the fall-through in `providerHasWatch`
- [ ] `git diff --stat` shows only the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- An existing test fails because it expected Simkl to force a skip on another
  provider. Report its name: it may encode a product decision.
- `providerHasWatch` has gained a `case 'simkl'` since this plan was written
  (then the bug may already be fixed differently).
- The fix seems to need a change in `reconcile.ts` or `fan-out.ts`.

## Maintenance notes

- When a real Simkl reconcile read lands, add `case 'simkl'` to the switch.
  The `null` path then serves only future providers without a read.
- Reviewers: confirm the `catch` still returns `false`, and that `rewatch` is
  computed from known-state providers only.
- With this change a rewatch also sends Simkl a plain history write (Simkl's
  adapter ignores `rewatch`). That matches today's Simkl behaviour.
