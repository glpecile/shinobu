# Plan 045: Watched-library indexes are built once per snapshot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/lib/media-progress.ts src/lib/media-progress.test.ts src/state/queries/media-progress.ts`
> If any changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

`useProgressLibraries` builds a sorted index of each watched library (Trakt
movies, Trakt shows, AniList, Serializd). React Compiler memoizes that per
component instance only. Four screens call the hook (a person page, two list
detail screens, an anime season list), so each mount sorts each library again:
for 2,000 films, 3 columns × N·log₂N ≈ 66,000 comparisons, per library, per
screen open. The index's own contract says: "Build it when the snapshot
changes, not per item or per render." The Simkl library already does this with
a `WeakMap` per snapshot (#478).

## Current state

`src/lib/media-progress.ts`:

```ts
/**
 * A library sorted once by each external id and by year, so a lookup
 * binary-searches one run of equal values instead of scanning every row. Build
 * it when the snapshot changes, not per item or per render.
 */
export interface LibraryIndex<T> {
  rows: readonly T[];
  itemOf: (row: T) => NormalizedMediaItem;
  columns: Record<IdKey | 'year', Column>;
}

export function indexLibrary<T>(
  rows: readonly T[],
  itemOf: (row: T) => NormalizedMediaItem,
): LibraryIndex<T> { ... }
```

`src/state/queries/media-progress.ts`, inside `useProgressLibraries`:

```ts
    // React Compiler rebuilds each index only when its snapshot changes. Simkl's
    // entry is the snapshot itself: `simkl.ts` indexes it once per snapshot.
    indexes: {
      movies: movies.data == null ? null : indexLibrary(movies.data, self),
      shows: shows.data == null ? null : indexLibrary(shows.data, self),
      simkl: simkl.data ?? null,
      anilist: anilist.data == null ? null : indexLibrary(anilist.data, entryItem),
      serializd: serializd.data == null ? null : indexLibrary(serializd.data, entryItem),
    },
```

The exemplar to copy, `src/state/queries/simkl.ts`:

```ts
// One index per snapshot: every single-item `select` on a details screen reads the same one.
// Never mutate a cached snapshot in place: the index would go stale. A refetch or
// `setQueryData` must give a new object.
const indexes = new WeakMap<SimklLibrary, SimklLibraryIndex>();

function indexSimklLibrary(library: SimklLibrary): SimklLibraryIndex {
  const known = indexes.get(library);
  if (known != null) return known;
  ...
  indexes.set(library, index);
  return index;
}
```

Each of the four snapshot arrays is always indexed with the same `itemOf`
(`self` for the Trakt arrays, `entryItem` for AniList and Serializd), so the
array alone is a correct cache key.

## Commands you will need

| Purpose   | Command                                                                                          | Expected on success |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| Install   | `bun install`                                                                                    | exit 0              |
| Typecheck | `bun typecheck`                                                                                  | exit 0              |
| Tests     | `bun test --isolate src/lib/media-progress.test.ts src/state/queries/media-progress.test.ts`     | all pass            |
| Lint      | `bun lint`                                                                                       | exit 0              |

## Scope

**In scope**:

- `src/lib/media-progress.ts` (add one exported function)
- `src/lib/media-progress.test.ts` (one new test)
- `src/state/queries/media-progress.ts` (the four `indexLibrary` calls and the comment above them)

**Out of scope**: `src/state/queries/simkl.ts` (already correct; do not merge
its cache with this one), `indexLibrary` itself, and every caller of
`useProgressLibraries`.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(progress): index each watched library once per snapshot`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the failing test

In `src/lib/media-progress.test.ts`, add one test near the existing
`indexLibrary` tests: `a snapshot is indexed once`. Import
`indexLibraryOnce` (it does not exist yet). With two arrays `a` and `b` of
items (reuse the file's item helper):

- `indexLibraryOnce(a, itemOf)` called twice returns the same object (`toBe`).
- `indexLibraryOnce(b, itemOf)` returns a different object from `a`'s.

**Verify**: `bun test --isolate src/lib/media-progress.test.ts` → the new test
fails (import missing).

### Step 2: Add `indexLibraryOnce`

In `src/lib/media-progress.ts`, directly below `indexLibrary`, add:

```ts
// Never mutate a snapshot in place: its index would go stale. A refetch or
// `setQueryData` gives a new array. One snapshot always takes the same `itemOf`.
const indexes = new WeakMap<readonly unknown[], LibraryIndex<unknown>>();

/** `indexLibrary`, built once per snapshot array and shared by every reader of it. */
export function indexLibraryOnce<T>(
  rows: readonly T[],
  itemOf: (row: T) => NormalizedMediaItem,
): LibraryIndex<T> { ... }
```

Look up `rows` in the `WeakMap`, build with `indexLibrary` on a miss, store,
return. One type cast at the `WeakMap` boundary is acceptable; do not use `any`
if `unknown` plus a cast works under `bun lint`.

**Verify**: `bun test --isolate src/lib/media-progress.test.ts` → all pass.

### Step 3: Use it in `useProgressLibraries`

In `src/state/queries/media-progress.ts`, replace the four `indexLibrary(`
calls in `indexes` with `indexLibraryOnce(`. Update the import. Rewrite the
two-line comment above `indexes` so that it is true: each index is built once
per snapshot and shared by every screen; Simkl's entry is the snapshot itself,
indexed in `simkl.ts`. Keep it to two lines.

**Verify**:
`grep -c "indexLibrary(" src/state/queries/media-progress.ts` → `0`.
`bun test --isolate src/lib/media-progress.test.ts src/state/queries/media-progress.test.ts` → all pass.

### Step 4: Gates

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0 (remove the
`indexLibrary` import from `state/queries/media-progress.ts` if it is now
unused).

## Test plan

One new test (Step 1), with one case for a hit and one for a miss.

## Done criteria

- [ ] Both test files pass
- [ ] `bun typecheck` and `bun lint` exit 0
- [ ] `grep -c "indexLibrary(" src/state/queries/media-progress.ts` → `0`
- [ ] `git diff --name-only HEAD~1` lists only the three in-scope files

## STOP conditions

- The code does not match "Current state".
- You find code that mutates a watched-library array in place after it is in
  the query cache (search `src/state/queries/trakt.ts`, `anilist.ts`,
  `serializd.ts` and `src/features/log-media/use-log-media.ts` for `.push(`,
  `.splice(`, `.sort(` on cached library data). Report the location.
- One snapshot array is indexed with two different `itemOf` functions.

## Maintenance notes

- The cache key is the array identity. Any future optimistic update of a
  watched library must write a new array with `setQueryData`.
- Reviewer: check the STOP search was done and reported.
