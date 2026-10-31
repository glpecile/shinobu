# Plan 014: Retrying a failed provider never turns a landed write into a rewatch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/log-media/fan-out.ts src/features/log-media/use-log-media.ts src/features/log-media/use-log-media.test.ts src/features/log-media/log-confirm-sheet.tsx`
> Plan 005 also edits `planLogWrite` (the reconcile records). If it has landed,
> expect that diff, and check that the excerpt below still matches everywhere else. Any
> other mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-simkl-reconcile-blocks-rewatches.md (same function; land 005 first to avoid a conflict)
- **Category**: bug
- **Confidence**: MED (the path is clear in code; how often a failed write actually landed server-side is unmeasured)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

When a log fails on some providers, the confirm sheet offers "retry" and
re-selects only the failed providers. The comment there says why: "re-sending
a provider that already landed would log the watch twice". But the retry goes
through the full plan again, including reconcile. Suppose the "failed" write
actually landed (a timeout or 5xx after the server committed), and the
provider's state is re-read fresh. Then the provider now "has it". As the only
target it is at parity, so the retry is sent **as a rewatch**. Trakt records an
extra play, and AniList increments `repeat` or sets REPEATING. That is exactly
the double log the retry tries to avoid.

After this plan, a retry carries the original round's `rewatch` decision. If
the original round was not a rewatch, a retried provider that already has the
watch is **skipped** ("already logged"), never upgraded to a rewatch. If the
original round *was* a rewatch, the retry stays a rewatch.

## Current state

`src/features/log-media/log-confirm-sheet.tsx`:

```tsx
  const [selectedProviders, setSelectedProviders] = useState(targets);
  ...
  function confirm() {
    ...
    const write = logMedia.mutateAsync({
      item,
      episodes: request.episodes,
      entryEpisodes: request.entryEpisodes,
      providers: selectedProviders,
      liked,
      ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
    });
  ...
  const result = logMedia.data;
  ...
  // Back to the form with only what failed selected: re-sending a provider
  // that already landed would log the watch twice.
  function retry() {
    if (result != null && result.failed.length > 0) {
      setSelectedProviders([...result.failed]);
    }
    logMedia.reset();
  }
```

`logMedia.data` is a `LogMediaResult` (`fan-out.ts`), which includes `rewatch: boolean`.

`src/features/log-media/fan-out.ts`, `LogMediaVariables` (abridged):

```ts
export interface LogMediaVariables {
  item: NormalizedMediaItem;
  episode?: ...; episodes?: ...; entryEpisodes?: number[];
  watchedAt?: string; tags?: string[]; liked?: boolean;
  /** Set by the reconcile step (plan 0011), never by callers: ... */
  rewatch?: boolean;
  /** Caller-override of which routed providers to actually write. ... */
  providers?: ProviderId[];
}
```

`src/features/log-media/use-log-media.ts`, `planLogWrite` (abridged; after plan 005 the `records` line differs):

```ts
  const decisions = reconcileLogTargets(records);
  const skipped = decisions.filter((d) => d.action === 'skip').map((d) => d.provider);
  const writeTargets = targets.filter((provider) => !skipped.includes(provider));
  const rewatch =
    decisions.length > 0 && decisions.every((decision) => decision.action === 'rewatch');
  const {
    episode: _episode,
    episodes: _episodes,
    entryEpisodes: _entryEpisodes,
    ...rest
  } = variables;
  return { item, targets, writeTargets, skipped, mappingSkips, rewatch,
    variables: { ...rest, item, rewatch, ... } };
```

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
- `src/features/log-media/fan-out.ts`: `LogMediaVariables` only (one new optional field)
- `src/features/log-media/use-log-media.ts`: `planLogWrite` only
- `src/features/log-media/log-confirm-sheet.tsx`: `retry`, `confirm`, plus one `useState`
- `src/features/log-media/use-log-media.test.ts`

**Out of scope**: `reconcile.ts`, the catch-up chain and quick-log flows (they
don't use this retry), and the write adapters.

## Git workflow

- Branch: `fix/log-retry-rewatch`
- One commit: `fix(log): keep a retry from upgrading a landed write to a rewatch`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the variable

In `LogMediaVariables`, after `providers`:

```ts
  /**
   * Set by the confirm sheet's retry: the original round's rewatch decision.
   * A retried provider that already has the watch then landed on the first
   * try, so it is skipped instead of being logged again as a rewatch.
   */
  retryOf?: { rewatch: boolean };
```

**Verify**: `bun typecheck` → exit 0.

### Step 2: Honour it in `planLogWrite`

Replace the `decisions` line with:

```ts
  const retryOf = variables.retryOf;
  const decisions: LogDecision[] =
    retryOf == null
      ? reconcileLogTargets(records)
      : records.map(({ provider, hasIt }) => ({
          provider,
          action: retryOf.rewatch ? 'rewatch' : hasIt ? 'skip' : 'log',
        }));
```

Import the `LogDecision` type from `./reconcile` if it isn't imported yet. The
`rewatch` computation below stays as is. With `retryOf`, it evaluates to the
original decision whenever any record exists.

Then add `retryOf: _retryOf` to the destructuring that builds `rest`, so the
field never reaches the adapters.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Send it from the sheet

In `log-confirm-sheet.tsx`:

- `const [retryOf, setRetryOf] = useState<{ rewatch: boolean } | null>(null);`
  next to the other form state.
- In `retry()`, inside the `if`, add `setRetryOf({ rewatch: result.rewatch });`.
- In `confirm()`, add `...(retryOf != null ? { retryOf } : {})` to the
  `mutateAsync` variables.

When the whole mutation threw (`logMedia.isError`, `result == null`), nothing
landed, so no `retryOf` is set. That is correct.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 4: Test

In `use-log-media.test.ts`, add one test next to plan 005's movie test, or
next to `'a Letterboxd film the member page already shows is logged again as a rewatch'`:

- Movie item with `externalIds: { trakt: 1, tmdb: 27205 }`.
- Seed `traktQueryKeys.watchedMovies()` with `[item]` (Trakt has it).
- `const plan = await planLogWrite(queryClient, { item, providers: ['trakt'], retryOf: { rewatch: false } }, ['trakt']);`
- Expect `plan.rewatch` to be `false`, `plan.skipped` to equal `['trakt']`,
  `plan.writeTargets` to equal `[]`, and `plan.variables` to have no `retryOf` property.

Without `retryOf` the same call gives `rewatch: true`. That is the bug path,
which a test elsewhere already pins for Letterboxd, so don't add a second test for it.

**Verify**: `bun test src/features/log-media/use-log-media.test.ts` → all pass.

## Test plan

- One new case: retry of a non-rewatch round whose provider now has it → skip.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "retryOf" src/features/log-media/log-confirm-sheet.tsx` → state, set in `retry`, sent in `confirm`
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- An empty `writeTargets` makes `useLogMedia` throw ("no connected provider
  applies") instead of reporting a skip. Read the hook's handling of an empty
  `writeTargets` before step 4. If it throws, report back: the sheet would then
  show an error for a write that actually succeeded.
- `LogMediaResult.rewatch` no longer exists.

## Maintenance notes

- Only the confirm sheet's retry sets `retryOf`. Any future "retry" affordance
  (a toast action, the catch-up chain) should pass the original round's
  `rewatch` the same way.
