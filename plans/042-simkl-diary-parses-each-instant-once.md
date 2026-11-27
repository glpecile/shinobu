# Plan 042: The Simkl diary projection parses each instant once

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/lib/providers/simkl/diary.ts src/lib/providers/simkl/diary.test.ts`
> If either changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

`simklDiaryEntries` turns the whole Simkl library into diary entries, sorts
them newest first, and keeps 500. The sort comparator calls `Date.parse` twice
per comparison, and an entry object (with a template-string id) is built for
every dated episode before the cut. For a library with N dated episodes that
is about 2·N·log₂N parses: about 120,000 at N = 5,000. It runs on every diary
refetch, which follows every successful log. Hermes parses dates slowly.
`plans/031` applied the same fix to the diary merge ("parse once into a key
column"). This copy was missed. `PERF.md` (Data layout): "If work does not
depend on the item, do it once in the producer, not once per lookup."

## Current state

`src/lib/providers/simkl/diary.ts` (whole file is about 95 lines):

```ts
const SIMKL_DIARY_WINDOW = 500;

/** Ordering key — Simkl instants are ISO-with-Z; unparseable sinks last. */
function entryMs(entry: NormalizedDiaryEntry): number {
  const ms = Date.parse(entry.watchedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

function episodeEntries(entry: SimklLibraryEntry, includeSeason: boolean): NormalizedDiaryEntry[] {
  const entries: NormalizedDiaryEntry[] = [];
  for (const episode of entry.watchedEpisodes) {
    if (episode.watchedAt == null) continue;
    entries.push({
      id: `${entry.item.id}-s${episode.season}e${episode.number}`,
      provider,
      watchedAt: episode.watchedAt,
      item: entry.item,
      episodes: [episode.number],
      ...(includeSeason ? { season: episode.season } : {}),
    });
  }
  return entries;
}

function playEntry(entry: SimklLibraryEntry): NormalizedDiaryEntry | undefined { ... }

export function simklDiaryEntries(library: SimklLibrary): NormalizedDiaryEntry[] {
  const entries: NormalizedDiaryEntry[] = [];
  for (const entry of library.shows) {
    entries.push(...episodeEntries(entry, true));
  }
  for (const entry of library.anime) {
    if (entry.item.isFilm === true) {
      const play = playEntry(entry);
      if (play != null) entries.push(play);
    } else {
      entries.push(...episodeEntries(entry, false));
    }
  }
  for (const entry of library.movies) {
    const play = playEntry(entry);
    if (play != null) entries.push(play);
  }
  return entries.sort((a, b) => entryMs(b) - entryMs(a)).slice(0, SIMKL_DIARY_WINDOW);
}
```

`Array.prototype.sort` is stable. Today, entries with equal instants keep
their flatten order (shows, then anime, then movies; episodes in
`watchedEpisodes` order). The new code must give the same order, ties included.

Tests: `src/lib/providers/simkl/diary.test.ts` (7 tests, one of them "caps the
projection at the 500 newest entries").

## Commands you will need

| Purpose   | Command                                                    | Expected on success |
| --------- | ---------------------------------------------------------- | ------------------- |
| Install   | `bun install`                                              | exit 0              |
| Typecheck | `bun typecheck`                                            | exit 0              |
| Tests     | `bun test --isolate src/lib/providers/simkl/diary.test.ts` | all pass            |
| Lint      | `bun lint`                                                 | exit 0              |

## Scope

**In scope**:

- `src/lib/providers/simkl/diary.ts`
- `src/lib/providers/simkl/diary.test.ts` (one new test)

**Out of scope**: every other file. The exported signature
`simklDiaryEntries(library: SimklLibrary): NormalizedDiaryEntry[]`, the window
of 500, and each entry's fields and `id` format do not change.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit: `perf(simkl): parse each diary instant once before the sort`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Write the failing test first

In `diary.test.ts`, inside the existing `describe('simklDiaryEntries — window', ...)`
block, add one test: `parses each instant once`. Build a library with one show
that has 600 dated episodes (reuse the helpers the neighbouring "caps the
projection" test uses). Count `Date.parse` calls with `spyOn(Date, 'parse')`
from `bun:test`, call `simklDiaryEntries`, and assert the call count is at most
600. Restore the spy (`mockRestore()`) in the test, even on failure
(`try`/`finally`).

**Verify**: `bun test --isolate src/lib/providers/simkl/diary.test.ts` → the
new test FAILS (the count is in the thousands) and the other 7 pass. If the new
test passes before you change `diary.ts`, STOP.

### Step 2: Collect candidates, sort keys, then build entries

Rewrite the body of `simklDiaryEntries` so that it:

1. Walks the library in the same order as today and records one light
   candidate per dated episode or play, with its instant parsed once
   (`Number.isNaN(ms) ? 0 : ms`, as `entryMs` does today). A candidate holds
   what is needed to build the entry later (for example the library entry, the
   episode or `undefined` for a play, the `includeSeason` flag, the `watchedAt`
   string) plus the `ms` number. Do not build the `NormalizedDiaryEntry` or its
   template-string id yet.
2. Sorts candidates by `b.ms - a.ms`. The sort is stable, so ties keep walk
   order, as today.
3. Takes the first `SIMKL_DIARY_WINDOW` and maps only those to
   `NormalizedDiaryEntry` objects with exactly today's fields.

Delete `entryMs` if nothing uses it. Keep `playEntry`'s date rule
(`lastWatchedAt`, else the first dated episode). Keep the existing doc comments
that still describe the code, and move them with it. Do not add comments that
restate the code.

**Verify**: `bun test --isolate src/lib/providers/simkl/diary.test.ts` → all 8 pass.

### Step 3: Gates

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

One new test (Step 1). It pins the parse count, which is the regression this
plan fixes. The existing 7 tests pin the output and must pass unmodified.

## Done criteria

- [ ] `bun test --isolate src/lib/providers/simkl/diary.test.ts` → 8 pass
- [ ] `bun typecheck` and `bun lint` exit 0
- [ ] `grep -n "entryMs(b) - entryMs(a)" src/lib/providers/simkl/diary.ts` → no match
- [ ] The 7 existing tests are unmodified (`git diff HEAD~1 -- src/lib/providers/simkl/diary.test.ts` shows only added lines)
- [ ] `git diff --name-only HEAD~1` lists only the two in-scope files

## STOP conditions

- `diary.ts` does not match "Current state".
- The new test passes before the change.
- An existing test fails after the change and you cannot fix it without
  changing that test.

## Maintenance notes

- The candidate walk order is the tie-break. A reviewer should compare it to
  the old loop order: shows, anime (films as plays), movies.
- The window constant has an existing doc comment that explains 500. Keep it.
