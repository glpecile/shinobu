# Plan 043: Up Next groups the Simkl calendar by show once per gather

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/state/queries/up-next.ts`
> If it changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

When a Simkl library entry has no `nextToWatch` pointer, Up Next looks for its
next airing in the Simkl calendar files. `calendarPointer` filters the whole
calendar (two files of about 1.5 MB each, thousands of rows) once per such
entry. With N entries and M airings that is N × M predicate calls on every
gather. A gather runs at launch, on a stale foreground, after every Trakt,
AniList or Simkl log, and on pull-to-refresh. The grouping by show id does not
depend on the entry. `PERF.md` (Data layout): "If work does not depend on the
item, do it once in the producer, not once per lookup."

## Current state

`src/state/queries/up-next.ts`:

```ts
/** When the progress snapshot has no next pointer, use the aired calendar entry. */
function calendarPointer(
  entry: SimklLibraryEntry,
  airings: readonly SimklCalendarEntry[],
): SimklNextToWatch | undefined {
  const simklId = entry.item.externalIds.simkl;
  const [next] = airings
    .filter(
      (airing) =>
        airing.simklId === simklId &&
        airing.episode != null &&
        // Simkl's own pointer never names a special.
        airing.episode.season !== 0 &&
        // Anime airings are seasonless; the snapshot files them under season 1.
        !entry.watchedKeys.has(`${airing.episode.season ?? 1}-${airing.episode.number}`),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || (a.episode?.number ?? 0) - (b.episode?.number ?? 0),
    );
  ...
}

function simklProgressInput(
  entry: SimklLibraryEntry,
  airings: readonly SimklCalendarEntry[],
): ProgressUpNextInput {
  const next = entry.nextToWatch ?? calendarPointer(entry, airings);
  ...
}
```

and at the end of `simklInputs`:

```ts
  const airings = entries.some((entry) => entry.nextToWatch == null)
    ? await Promise.all([
        simklCalendarFile(queryClient, 'tv'),
        simklCalendarFile(queryClient, 'anime'),
      ]).then(
        (files) => files.flat(),
        () => [],
      )
    : [];
  return entries.map((entry) => simklProgressInput(entry, airings));
```

`SimklCalendarEntry` (`src/lib/providers/simkl/normalize.ts`) has
`simklId: number`, `date: string`, and an optional `episode`.
`entry.item.externalIds.simkl` may be `undefined`; today such an entry matches
no airing, and that must stay true.

## Commands you will need

| Purpose   | Command                                                | Expected on success |
| --------- | ------------------------------------------------------ | ------------------- |
| Install   | `bun install`                                          | exit 0              |
| Typecheck | `bun typecheck`                                        | exit 0              |
| Tests     | `bun test --isolate src/state/queries/up-next.test.ts` | all pass            |
| Lint      | `bun lint`                                             | exit 0              |

## Scope

**In scope**: `src/state/queries/up-next.ts`, and
`src/state/queries/up-next.test.ts` only if Step 1 says a test is missing.

**Out of scope**: every other file. The value `simklInputs` returns must be
identical for the same inputs. Do not change the filter conditions, the sort,
or `simklCalendarFile`.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(up-next): group the Simkl calendar by show once per gather`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Check that a test pins the calendar fallback

`up-next.test.ts` has a fake query client that serves Simkl calendar files
(search for `kind === 'calendar'`). Find a test in which a Simkl library entry
has no `nextToWatch` and the expected input takes its `nextEpisode` from a
calendar airing.

- If one exists: note its name for your report. Add no test.
- If none exists: add exactly one test next to the other Simkl tests, with one
  `watching` show without `nextToWatch`, a calendar that holds two airings for
  that show (one already in `watchedKeys`) and one airing for another show.
  Assert the input's `nextEpisode` is the unwatched airing. Run it and confirm
  it passes BEFORE Step 2.

**Verify**: `bun test --isolate src/state/queries/up-next.test.ts` → all pass.

### Step 2: Group once, look up per entry

In `simklInputs`, after `airings` resolves, build one
`Map<number, SimklCalendarEntry[]>` keyed by `airing.simklId` (skip nothing:
keep every airing in its bucket, in file order). Pass that map to
`simklProgressInput` and `calendarPointer` in place of the flat array.
`calendarPointer` reads the entry's bucket (an empty result when the id is
`undefined` or has no bucket), then applies the same remaining filter
conditions and the same sort.

Build the map only when `airings` is non-empty. Keep the three existing inline
comments in the filter. Do not add comments that restate the code.

**Verify**: `bun test --isolate src/state/queries/up-next.test.ts` → all pass.

### Step 3: Gates

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.
`grep -n "airing.simklId === simklId" src/state/queries/up-next.ts` → no match.

## Test plan

Covered by Step 1: at most one new test, only if the fallback has none. No
call-count test: the functions are private and the change is a pure regrouping.

## Done criteria

- [ ] `bun test --isolate src/state/queries/up-next.test.ts` passes
- [ ] `bun typecheck` and `bun lint` exit 0
- [ ] `calendarPointer` no longer scans the full calendar (grep in Step 3)
- [ ] `git diff --name-only HEAD~1` lists only in-scope files

## STOP conditions

- The code does not match "Current state".
- An existing test fails after Step 2.
- The fix seems to need a change outside `up-next.ts`.

## Maintenance notes

- A bucket keeps file order, and the sort inside `calendarPointer` is
  unchanged, so tie order is the same as before.
- Reviewer: confirm an entry without a Simkl id still gets no pointer.
