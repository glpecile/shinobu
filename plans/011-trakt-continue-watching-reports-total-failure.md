# Plan 011: Trakt Continue Watching reports an error when every progress call fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/up-next.ts src/state/queries/up-next.test.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 012 builds on the same "errors" signal; land this first or alongside)
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Up Next's Trakt leg reads the watched-shows pool (usually from cache) and then
makes one progress call per pooled show. Each call is wrapped in
`catch { return null; }` so one failing show doesn't hide the others. But when
**every** call fails (offline with a cached pool, a 401 whose refresh fails, a
Trakt `/progress` outage), the leg resolves `[]` with **no error**. The query
uses `refetchMode: 'replace'`, so a good cached Continue Watching section is
replaced by an empty one with no error banner. The empty result is persisted
to disk, and it feeds the release-notification schedule (see plan 012). After
this plan, "the pool was non-empty and nothing succeeded" counts as a Trakt
failure through the existing `settle('trakt', …)` path. A single failing
show is still omitted quietly.

## Current state

`src/state/queries/up-next.ts`, `traktInputs` (~lines 106–158, abridged):

```ts
  const pool = selectUpNextPool(shows);
  const results = await Effect.runPromise(
    Effect.forEach(
      pool,
      (item) =>
        Effect.promise(async (): Promise<ProgressUpNextInput | null> => {
          const traktId = item.externalIds.trakt;
          if (traktId == null) return null;
          try {
            const progress = await queryClient.fetchQuery({ ... showProgress ... });
            ...
            return { item, source: 'trakt', ... };
          } catch {
            return null;
          }
        }),
      { concurrency: PROGRESS_CONCURRENCY },
    ),
  );

  return results.filter((input): input is ProgressUpNextInput => input != null);
```

It is called as `settle('trakt', () => traktInputs(queryClient))` (~line 704).
`settle` (`src/state/queries/settle.ts`) turns a rejection into
`{ inputs: [], errors: [{ provider, message }] }`, and the screen shows it.

Tests: `src/state/queries/up-next.test.ts` has a `fakeClient(scenario)` harness.
`scenario.failingProgress: number[]` makes those shows' progress calls throw
`progress ${id} down`. These existing tests must keep passing:

```ts
  test('one show’s progress failing omits that show, not the rest', async () => {
    const { client } = fakeClient({
      shows: [show(1, '…'), show(2, '…'), show(3, '…')],
      failingProgress: [2],
    });
    const inputs = await fetchUpNextInputs(client, ['trakt']);
    expect(inputs.progress.map((input) => input.item.externalIds.trakt)).toEqual([1, 3]);
    // A single failed show is not a slot-level failure.
    expect(inputs.errors).toEqual([]);
  });

  test('a failed provider surfaces as an error while the other still returns', async () => {
    const { client } = fakeClient({ failing: ['trakt'], anime: [animeEntry(1)] });
    ...
    expect(inputs.errors).toEqual([{ provider: 'trakt', message: 'watched shows down' }]);
  });
```

Note the Effect usage: `Effect.promise` here wraps a function that never
rejects. Keep it that way. Record the failure in a local variable, not as an
Effect failure.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`               | exit 0              |
| Typecheck | `bun typecheck`                               | exit 0              |
| One file  | `bun test src/state/queries/up-next.test.ts`  | all pass            |
| All tests | `bun run test`                                | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                    | exit 0              |

## Scope

**In scope**: `src/state/queries/up-next.ts` (`traktInputs` only),
`src/state/queries/up-next.test.ts`.

**Out of scope**: the Simkl and AniList legs, `settle.ts`, the calendar legs,
`PROGRESS_CONCURRENCY` and the pool size.

## Git workflow

- Branch: `fix/up-next-trakt-total-failure`
- One commit: `fix(up-next): report Trakt as failed when every progress read fails`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Count failures and throw when all failed

In `traktInputs`:

- Before the `Effect.forEach`, declare `let attempted = 0; let firstFailure: unknown;`
- Inside the per-item function, after the `traktId == null` early return, do
  `attempted += 1;`. In the `catch (error)` (give it a binding), set
  `firstFailure ??= error;` and keep `return null;`.
- After `results` is computed:

```ts
  const inputs = results.filter((input): input is ProgressUpNextInput => input != null);
  // One show failing omits that show; every show failing is the leg failing,
  // so settle() reports it instead of replacing good cached rows with none.
  if (attempted > 0 && inputs.length === 0 && firstFailure !== undefined) throw firstFailure;
  return inputs;
```

`inputs.length === 0 && firstFailure !== undefined` with `attempted > 0` means
no attempted call succeeded and at least one threw. Shows skipped for a
missing Trakt id don't count as attempts.

Edge to confirm by reading: a progress response can succeed and still map to
an input (`nextEpisode` may be absent, but the function returns an object). So
`inputs.length === 0` with no `firstFailure` (an empty pool) stays a normal `[]`.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Test

Add one case to `describe('fetchUpNextInputs')` in `up-next.test.ts`, right
after `'one show’s progress failing omits that show, not the rest'`:

```ts
  test('every show’s progress failing is a Trakt error, not an empty section', async () => {
    const { client } = fakeClient({
      shows: [show(1, '2026-07-20T00:00:00.000Z'), show(2, '2026-07-19T00:00:00.000Z')],
      failingProgress: [1, 2],
    });

    const inputs = await fetchUpNextInputs(client, ['trakt']);

    expect(inputs.progress).toEqual([]);
    expect(inputs.errors).toContainEqual({ provider: 'trakt', message: 'progress 1 down' });
  });
```

`progress 1 down` assumes show 1 is attempted first (most recent first, and
`concurrency` keeps start order). If the message is `progress 2 down` instead,
assert with `expect.stringMatching(/^progress \d down$/)` rather than relying on order.

**Verify**: `bun test src/state/queries/up-next.test.ts` → all pass.

## Test plan

- One new case for the all-failed branch. The existing one-failed case pins the
  other branch, so add nothing for it.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `git diff --stat` shows only the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `traktInputs` is no longer called through `settle('trakt', …)`.
- The new error shows up twice in `inputs.errors` (e.g. the calendar leg also
  fails in the fake). Adjust the assertion to `toContainEqual` and report it if
  the screen would render duplicates.

## Maintenance notes

- With plan 012, an all-failed Trakt leg no longer wipes Trakt notifications.
- If the Simkl progress leg ever gains a per-show fan, apply the same rule there.
