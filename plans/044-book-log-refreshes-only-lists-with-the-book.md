# Plan 044: A book log refreshes only the Hardcover lists that hold the book

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/features/log-media/use-log-media.ts src/features/log-media/invalidate-after-log.test.ts`
> If either changed, compare against "Current state". On a mismatch, STOP.
>
> **Safety rule for this repo**: never send a Hardcover mutation, from a test,
> a script or a probe. This plan needs no network access at all.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

After every successful Hardcover log (each page-progress step is one),
`invalidateAfterLog` invalidates the root key of every Hardcover list. Each
mounted list refetches every loaded page (100 books per page), including lists
that do not hold the logged book. The common path is list → book → log, and
the list screen stays mounted in the native stack. The only viewer data a list
row holds is the book's read status, so only a list that holds the book can
change. Each request also counts against Hardcover's per-token budget.
`PERF.md` (Invalidation): "After a log, invalidate the logged item with a
predicate, not the root key."

## Current state

`src/features/log-media/use-log-media.ts`, inside `invalidateAfterLog`:

```ts
export function invalidateAfterLog(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  succeeded: readonly ProviderId[],
  skipped: readonly ProviderId[] = [],
): Promise<void> {
  const refetches: Promise<void>[] = [];
  const invalidate = (filters: InvalidateQueryFilters) => {
    refetches.push(queryClient.invalidateQueries(filters));
  };
  ...
  if (succeeded.includes(Provider.Hardcover)) {
    invalidate({ queryKey: hardcoverQueryKeys.libraryRoot() });
    invalidate({ queryKey: hardcoverQueryKeys.listRoot() });
  }
```

The same function already has the pattern to copy, for Letterboxd:

```ts
    invalidate({
      queryKey: letterboxdQueryKeys.filmWatchesRoot(),
      predicate: ({ queryKey }) => ...,
    });
```

List query (`src/state/queries/hardcover.ts`): key
`hardcoverQueryKeys.list(id)` = `[...hardcoverQueryKeys.listRoot(), id]`, an
infinite query. Its cached data is
`InfiniteData<HardcoverListPage>` = `{ pages: HardcoverListPage[], pageParams }`.
`HardcoverListPage` (`src/lib/providers/hardcover/lists.ts`):

```ts
export interface HardcoverListEntry {
  id: string;
  position: number | null;
  item: NormalizedMediaItem;
  authors: string[];
  statusId: number | null;
}
export interface HardcoverListPage {
  list: HardcoverList;
  mine: boolean;
  entries: HardcoverListEntry[];
  hasNextPage: boolean;
}
```

The logged book's id is `item.externalIds.hardcover` (a number, may be absent).

The test that pins today's broad behaviour,
`src/features/log-media/invalidate-after-log.test.ts`:

```ts
  test('a successful book log refreshes the read status on cached lists', () => {
    const client = new QueryClient();
    const key = hardcoverQueryKeys.list(42);
    client.setQueryData(key, {});
    invalidateAfterLog(client, { ...ITEM, type: 'BOOK' }, ['hardcover']);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });
```

## Commands you will need

| Purpose   | Command                                                               | Expected on success |
| --------- | --------------------------------------------------------------------- | ------------------- |
| Install   | `bun install`                                                         | exit 0              |
| Typecheck | `bun typecheck`                                                       | exit 0              |
| Tests     | `bun test --isolate src/features/log-media/invalidate-after-log.test.ts` | all pass         |
| Lint      | `bun lint`                                                            | exit 0              |

## Scope

**In scope**:

- `src/features/log-media/use-log-media.ts` (only the Hardcover branch of `invalidateAfterLog`)
- `src/features/log-media/invalidate-after-log.test.ts` (replace the one test above)

**Out of scope**: every other branch of `invalidateAfterLog`, the
`libraryRoot` invalidation, `hardcoverQueryKeys`, and every file under
`src/lib/providers/hardcover/`.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(hardcover): refresh only the lists that hold the logged book`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Replace the test, and watch it fail

Replace the test `a successful book log refreshes the read status on cached
lists` with one test named `a book log refreshes only the cached lists that
hold the book`. Seed two list queries with realistic data:

- `hardcoverQueryKeys.list(42)`: `{ pages: [{ entries: [{ item: { externalIds: { hardcover: 7 } } }] }], pageParams: [1] }`
- `hardcoverQueryKeys.list(43)`: the same shape with `hardcover: 8`

Call `invalidateAfterLog(client, { ...ITEM, type: 'BOOK', externalIds: { hardcover: 7 } }, ['hardcover'])`.
Assert list 42 `isInvalidated` is `true` and list 43 is `false`. Use a cast for
the seeded data if the types need it; match how the file's other tests seed
data. End with `client.clear()`.

**Verify**: `bun test --isolate src/features/log-media/invalidate-after-log.test.ts` →
the new test FAILS on the list 43 assertion; all others pass.

### Step 2: Add the predicate

Change the `listRoot` invalidation to pass a `predicate`. Rules:

- If `item.externalIds.hardcover` is `null` or `undefined`, keep today's
  behaviour: invalidate the whole `listRoot` (no predicate).
- Otherwise invalidate a list query only when its cached data holds an entry
  whose `item.externalIds.hardcover` equals the logged id, in any page.
- A list query with no data yet, or with data of an unexpected shape, is
  invalidated (fail open: a wasted refetch is better than a stale status).

Read the data from the `query` argument of the predicate
(`query.state.data`). Add one comment line that gives the reason, in the style
of the Letterboxd comment: only a list that holds the book shows its status.

**Verify**: `bun test --isolate src/features/log-media/invalidate-after-log.test.ts` → all pass.

### Step 3: Gates

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

One test replaced (Step 1). It covers both branches of the predicate: a list
with the book and a list without it. No second test.

## Done criteria

- [ ] `bun test --isolate src/features/log-media/invalidate-after-log.test.ts` passes
- [ ] `bun typecheck` and `bun lint` exit 0
- [ ] `grep -n "hardcoverQueryKeys.listRoot()" src/features/log-media/use-log-media.ts` shows the call with a `predicate` nearby
- [ ] `git diff --name-only HEAD~1` lists only the two in-scope files

## STOP conditions

- The code or the test does not match "Current state".
- The new test passes before Step 2.
- You find a consumer of a Hardcover list query whose data depends on a book
  that is not in its `entries` (then the predicate would be wrong).

## Maintenance notes

- If a list row ever shows data that a log can change for books outside the
  list (for example a list-level "books read" count from the server), widen
  the predicate.
- Reviewer: confirm the fail-open cases.
