# Plan 046: Watchlist membership indexes the gathered inputs once per snapshot

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/features/watchlist/use-is-watchlisted.ts src/features/watchlist/use-is-watchlisted.test.ts`
> If either changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

`watchlistSourcesFor` answers "which providers have this item on the
watchlist". For each call it builds the merge keys of every watchlist input.
For a film, a merge key includes a Unicode-property regex replace over the
title, which Hermes runs slowly. The function runs inside two
`useSyncExternalStore` snapshots (`useIsWatchlisted`,
`useWatchlistAddStillOffered`) that the details screen's watchlist button
mounts, so it runs on every render of that button and on every update of the
inputs query: 2 × W key builds each time, where W is every watchlist row
across providers (hundreds, or low thousands with a Letterboxd watchlist). The
keys of an input do not depend on the item being checked. `PERF.md` (Data
layout): "If work does not depend on the item, do it once in the producer, not
once per lookup."

## Current state

`src/features/watchlist/use-is-watchlisted.ts`:

```ts
export function watchlistSourcesFor(
  inputs: readonly WatchlistInput[],
  item: NormalizedMediaItem,
): ProviderId[] {
  const keys = new Set(watchlistMergeKeys(item));
  const sources = new Set<ProviderId>();
  for (const input of inputs) {
    const matches =
      input.item.id === item.id ||
      (keys.size > 0 && watchlistMergeKeys(input.item).some((key) => keys.has(key)));
    if (matches) sources.add(input.source);
  }
  return [...sources];
}
```

`WatchlistInput` (`src/features/watchlist/types.ts`) has `item:
NormalizedMediaItem` and `source: ProviderId`. `watchlistMergeKeys(item)`
(`src/features/watchlist/compute.ts`) returns `string[]` such as
`tmdb:MOVIE:949`, `imdb:tt0113277`, `title:heat|1995`.

Callers pass `data.inputs` from the query cache
(`queryClient.getQueryData<WatchlistInputs>(watchlistQueryKeys.inputs())`).
That array keeps its identity until the query data changes, and nothing
mutates it in place.

Result order today: providers in the order of their first matching input.
That order must not change.

The exemplar for a per-snapshot `WeakMap`, `src/state/queries/simkl.ts`:

```ts
// Never mutate a cached snapshot in place: the index would go stale. A refetch or
// `setQueryData` must give a new object.
const indexes = new WeakMap<SimklLibrary, SimklLibraryIndex>();
```

Tests: `src/features/watchlist/use-is-watchlisted.test.ts` has
`describe('watchlistSourcesFor (owner report 2026-08-01)')` with 4 tests and
helpers `film(id, overrides)` and `input(item, source)`.

## Commands you will need

| Purpose   | Command                                                                  | Expected on success |
| --------- | ------------------------------------------------------------------------ | ------------------- |
| Install   | `bun install`                                                            | exit 0              |
| Typecheck | `bun typecheck`                                                          | exit 0              |
| Tests     | `bun test --isolate src/features/watchlist src/features/watchlist-media` | all pass            |
| Lint      | `bun lint`                                                               | exit 0              |

## Scope

**In scope**:

- `src/features/watchlist/use-is-watchlisted.ts`
- `src/features/watchlist/use-is-watchlisted.test.ts` (one new test)

**Out of scope**: `compute.ts` (`watchlistMergeKeys` stays as it is), the two
hooks' `useSyncExternalStore` wiring, and every caller. The signature
`watchlistSourcesFor(inputs, item): ProviderId[]` does not change.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(watchlist): index the gathered inputs once per snapshot`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the failing test

In the existing `describe('watchlistSourcesFor ...')` block, add one test:
`a second lookup does not rebuild the inputs' keys`. Build an inputs array of
three rows. Give each input item a counting getter so the test can see key
builds without mocking a module, for example:

```ts
let reads = 0;
const counted = (item: NormalizedMediaItem): NormalizedMediaItem =>
  Object.defineProperty({ ...item }, 'externalIds', {
    get() {
      reads += 1;
      return item.externalIds;
    },
    enumerable: true,
  });
```

Call `watchlistSourcesFor(inputs, item)` once, set `reads = 0`, call it again
with the same `inputs` array and a different item, and assert `reads` is `0`.
Also assert both calls return the correct providers.

**Verify**: `bun test --isolate src/features/watchlist/use-is-watchlisted.test.ts` →
the new test FAILS (`reads` is greater than 0); the others pass.

### Step 2: Index the inputs once

In `use-is-watchlisted.ts`, add a module-scope
`WeakMap<readonly WatchlistInput[], Map<string, number[]>>`. The value maps a
key to the positions (indexes into `inputs`, ascending) of the inputs that
carry it. Index two kinds of key per input: each string from
`watchlistMergeKeys(input.item)`, and the item id under a prefix that no merge
key uses (for example `id:${input.item.id}`; merge keys start with `tmdb:`,
`imdb:` or `title:`, so confirm in `compute.ts` that none starts with `id:`).

`watchlistSourcesFor` then:

1. gets or builds the index for `inputs`;
2. collects the positions for `id:${item.id}` and for each of
   `watchlistMergeKeys(item)`;
3. sorts the collected positions ascending, removes duplicates, maps each to
   `inputs[position].source`, and removes duplicate providers while keeping
   first-seen order.

That gives the same providers in the same order as the loop it replaces. Put
the "never mutate a cached snapshot in place" reason in one comment above the
`WeakMap`.

**Verify**: `bun test --isolate src/features/watchlist src/features/watchlist-media` → all pass.

### Step 3: Gates

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

One new test (Step 1). The existing 4 tests pin the matching rules, including
"a provider contributing two matching rows is named once" and "an id-less,
year-less item still matches its own row by item id". They must pass
unmodified.

## Done criteria

- [ ] `bun test --isolate src/features/watchlist src/features/watchlist-media` passes
- [ ] `bun typecheck` and `bun lint` exit 0
- [ ] Existing tests are unmodified (`git diff HEAD~1 -- src/features/watchlist/use-is-watchlisted.test.ts` shows only added lines)
- [ ] `git diff --name-only HEAD~1` lists only the two in-scope files

## STOP conditions

- The code does not match "Current state".
- The new test passes before Step 2.
- A merge key can start with `id:` (then pick another prefix and say so in
  your report; if no safe prefix exists, STOP).
- You find code that mutates the cached `inputs` array in place.

## Maintenance notes

- The cache key is the `inputs` array identity. An optimistic watchlist update
  must write a new array with `setQueryData`.
- Reviewer: check the provider order rule in Step 2.
