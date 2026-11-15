# Plan 035: A later-season log that finds no AniList entry reports a reasoned AniList skip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/use-log-media.ts src/features/log-media/use-log-media.test.ts src/lib/providers/routing.ts src/lib/providers/routing.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

TMDB and Trakt keep an anime's later cours as seasons of one show. AniList
gives each cour its own entry. When the user logs a season 2+ episode from a
TMDB-shaped or Trakt-shaped show, `resolveLogPlan` looks for the AniList entry
that holds that season (`canonicalCourEntry`). When it finds none, the log
must not write to AniList, because the show's AniList id names the first cour.
That part is correct. The problem is how it is done: routing **removes**
AniList from the targets. The confirm sheet listed AniList with a checked
box, the user confirmed, and the report has no AniList line at all. Simkl, in
the same case, gets a visible skip: "Could not resolve a cour-specific Simkl
identity for these episodes", with a link to the item. `AGENTS.md` requires
that ("Never a dead-end error. … a skip links to the item on that provider").

After this plan, AniList gets the same treatment as Simkl: it stays a target,
is not written, and reports a skip with a reason and its link.

## Current state

### Files

- `src/features/log-media/use-log-media.ts` — `resolveLogPlan` builds the
  targets and the `mappingSkips` map. `withMappingSkips` turns a map entry
  into an adapter that returns `{ status: 'skipped', reason }` without writing.
- `src/lib/providers/routing.ts` — `resolveWriteTargets` and its option
  `nonSeasonOneEpisodes`, which this plan removes.
- `src/features/log-media/use-log-media.test.ts` and
  `src/lib/providers/routing.test.ts` — tests.

### Excerpts

`src/features/log-media/use-log-media.ts:467-492` (inside `resolveLogPlan`):

```ts
  const targets = resolveWriteTargets(item, connected, {
    capability: 'log',
    // Only a *canonical*-domain batch can drop AniList (plan 0011 / R6): that
    // guard exists because a canonical season 2 has no place on a season-1
    // AniList entry. An entry-domain batch is already in AniList's own
    // numbering, so it stays a target whatever season it maps to.
    nonSeasonOneEpisodes:
      cour == null &&
      entryInput == null &&
      canonicalInput != null &&
      canonicalInput.some((episode) => episode.season !== 1),
    onlyProviders: variables.providers,
    platform: currentPlatform(),
    letterboxdUserscript: hasLetterboxdUserscript(),
  });

  const mappingSkips = new Map<ProviderId, string>();
  if (
    targets.includes(Provider.Simkl) &&
    entryInput == null &&
    item.externalIds.anilist != null &&
    canonicalInput?.some((episode) => episode.season !== 1) === true &&
    ((item.type === 'TV' && cour == null) || (cour != null && cour.mal == null))
  ) {
    mappingSkips.set(Provider.Simkl, 'Could not resolve a cour-specific Simkl identity for these episodes');
  }
```

How a `mappingSkips` entry flows (already built, do not change):

- `planLogWrite` keeps a mapping-skipped provider in `targets` and
  `writeTargets`, and leaves it out of the watch-state reads
  (`reconcileTargets = targets.filter((provider) => !mappingSkips.has(provider))`).
- `useLogMedia` wraps the adapters with `withMappingSkips`, so the provider's
  adapter resolves `{ status: 'skipped', reason }`.
- The report shows a reasoned skip with a "Log on {Provider}" link
  (`manualLinkForOutcome` in `manual-write-links.ts`).

`src/lib/providers/routing.ts` — the option's docblock in `WriteTargetOptions`
(the field `nonSeasonOneEpisodes?: boolean;` with a long comment above it) and
its use in `resolveWriteTargets`:

```ts
  let targets = providersForWrite(item, connected, options.capability);
  if (options.nonSeasonOneEpisodes === true) {
    targets = targets.filter((provider) => provider !== Provider.AniList);
  }
```

`resolveLogPlan` is the only caller that sets the option
(`grep -rn nonSeasonOneEpisodes src` shows `use-log-media.ts`, `routing.ts`
and one routing test).

`src/lib/providers/routing.test.ts:336-360` (two tests about the option):

```ts
  it('drops AniList for a non-season-1 canonical episode batch', () => {
    expect(
      resolveWriteTargets(
        { type: 'TV', ...ids({ trakt: 1, anilist: 2 }) },
        ['trakt', 'anilist'],
        { capability: 'log', nonSeasonOneEpisodes: true, platform: 'ios' },
      ),
    ).toEqual(['trakt']);
  });

  // Plan 0027 R6/KTD2: an AniList-origin log reaches routing already
  // translated, so `useLogMedia` leaves the flag false and AniList survives
  // even when the batch maps to canonical season 2. Routing stays pure — it
  // never learns which domain the caller started in.
  it('keeps AniList when the caller does not raise the canonical-season flag', () => {
    ...
  });
```

`src/features/log-media/use-log-media.test.ts:394-417` (the test that pins the
silent drop):

```ts
  test('a canonical-domain TV log with an AniList id still drops AniList (R6)', async () => {
    const queryClient = client();
    const item: NormalizedMediaItem = {
      id: 'trakt-42',
      title: 'A Live-Action Show',
      ...
      type: 'TV',
      ...
      externalIds: { trakt: 42, tmdb: 42, anilist: 7 },
    };
    seedTrakt(queryClient, 42, []);

    const plan = await planLogWrite(
      queryClient,
      { item, episodes: [{ season: 2, number: 3 }] },
      ['trakt', 'anilist'],
    );

    expect(plan.targets).toEqual(['trakt']);
    expect(mappingCalls).toEqual([]);
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });
```

### Conventions that apply

- A provider id is written `Provider.AniList` outside tests (lint rule
  `shinobu/no-provider-literals`). Tests use string literals such as
  `'anilist'`, as the excerpts show.
- "When you touch a test file, delete the tests your change made redundant."
  and "never add a second" test for a branch (`AGENTS.md`). Here you change
  the existing test; you do not add one next to it.
- Comments never describe an earlier version of the code.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck | `bun typecheck` | exit 0, no errors |
| Lint | `bun lint` | exit 0 |
| Focused tests | `bun test --isolate src/features/log-media/use-log-media.test.ts src/lib/providers/routing.test.ts` | all pass |
| Full tests | `bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/features/log-media/use-log-media.ts` (`resolveLogPlan` only)
- `src/features/log-media/use-log-media.test.ts`
- `src/lib/providers/routing.ts` (`WriteTargetOptions`, `resolveWriteTargets`)
- `src/lib/providers/routing.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `canonicalCourEntry`. Do not try to find more cours in this plan.
- The Simkl skip condition and its reason string. Tests match that string.
- `withMappingSkips`, `planLogWrite`, `fanOutLog`, the report components.
- `providersForWrite` and `splitWriteTargets`.

## Git workflow

- Branch: `fix/anilist-unplaced-season-skip`
- One commit: `fix(log): report an AniList skip when a later season has no entry`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the skip in `resolveLogPlan`

In `src/features/log-media/use-log-media.ts`:

1. In the `resolveWriteTargets` call, delete the `nonSeasonOneEpisodes`
   property and the four-line comment above it.
2. Directly after `const mappingSkips = new Map<ProviderId, string>();`, add:

   ```ts
   // A later canonical season has no place on the show's AniList entry, which
   // is its first cour. With no cour found, the only safe move is not to write.
   if (
     targets.includes(Provider.AniList) &&
     cour == null &&
     entryInput == null &&
     canonicalInput?.some((episode) => episode.season !== 1) === true
   ) {
     mappingSkips.set(Provider.AniList, 'Could not find the AniList entry for this season');
   }
   ```

3. Further down in the same function, in the `if (entryInput == null) { return … }`
   branch, a comment on the `entry:` field says "AniList never receives it
   (the nonSeasonOneEpisodes guard above)". Change the words in parentheses to
   "(its mapping skip above)". Change nothing else there.

**Verify**: `bun typecheck` → exit 0. The option is still declared in
`routing.ts` and is optional, so removing the caller's use compiles.

### Step 2: Remove the unused routing option

In `src/lib/providers/routing.ts`:

1. Delete the `nonSeasonOneEpisodes?: boolean;` field and its docblock from
   `WriteTargetOptions`.
2. In `resolveWriteTargets`, delete the three-line `if
   (options.nonSeasonOneEpisodes === true) { … }` block. If `targets` is then
   never reassigned before the `onlyProviders` filter reassigns it, keep `let`.
3. In the docblock above `resolveWriteTargets`, remove the words "minus
   AniList for a non-season-1 *canonical* batch,".

**Verify**: `grep -rn "nonSeasonOneEpisodes" src --include="*.ts" --include="*.tsx" | grep -v "\.test\."` → no matches. `bun typecheck` → reports errors only in `routing.test.ts` (fixed in step 3).

### Step 3: Tests

In `src/lib/providers/routing.test.ts`:

- Delete the test `drops AniList for a non-season-1 canonical episode batch`.
- Delete the test `keeps AniList when the caller does not raise the
  canonical-season flag` and the four-line comment above it. Another test in
  the file already covers an anime item with both ids routing to both
  providers; if `grep -n "'trakt', 'anilist'\]" src/lib/providers/routing.test.ts`
  finds no remaining `toEqual(['trakt', 'anilist'])` expectation, keep this
  test instead and only rename it to `routes an anime with movie/TV ids to
  both`.

In `src/features/log-media/use-log-media.test.ts`, change the test at line
394. New name and expectations:

```ts
  test('a canonical later season with no AniList cour skips AniList with a reason', async () => {
    // (fixture and planLogWrite call unchanged)

    expect(plan.targets).toEqual(['trakt', 'anilist']);
    expect(plan.mappingSkips.get('anilist')).toBe('Could not find the AniList entry for this season');
    expect(plan.variables.episodes).toEqual([{ season: 2, number: 3 }]);
  });
```

Remove the old line `expect(mappingCalls).toEqual([]);` only if it fails; if
it still passes, keep it. In the fixture, the mock's `cachedAniListLaterCours`
returns `[]` and `cachedAniZipIds` returns `prequelIds` by default, so
`canonicalCourEntry` finds no cour. If the test file sets `courIds`,
`courMaps` or `laterCours` in an earlier test without resetting them, reset
them at the start of this test (`courIds = new Map(); courMaps = new Map();
laterCours = new Map();`).

Do not change the `test.each` named `a later TMDB season resolves its cour
safely`. It must pass as it is.

**Verify**: `bun test --isolate src/features/log-media/use-log-media.test.ts src/lib/providers/routing.test.ts` → all pass.

### Step 4: Full gates

**Verify**: `bun typecheck && bun lint && bun run test` → all exit 0.

## Test plan

- One changed test in `use-log-media.test.ts`; one or two deleted tests in
  `routing.test.ts`. No new test.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -rn "nonSeasonOneEpisodes" src` returns no matches
- [ ] `grep -n "Could not find the AniList entry for this season" src/features/log-media/use-log-media.ts` returns one match
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `grep -rn "nonSeasonOneEpisodes" src` shows a caller other than
  `use-log-media.ts` and the routing test.
- The `test.each` `a later TMDB season resolves its cour safely` fails after
  your change. Report which case.
- Any other existing test fails and the fix would need a change outside the
  in-scope files.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- Effect on the UI: a log of this kind is no longer a "clean" report, so the
  sheet shows its report step with the AniList line instead of closing into a
  toast. In the episode catch-up chain, each such episode adds a ledger row.
  That is the intended trade: before, the user was told nothing.
- The AniList link on that line opens the show's first-cour entry, because
  that is the only AniList id the item has.
- `invalidateAfterLog` receives AniList in its `skipped` list, so Up Next
  recomputes. That only costs a recompute from warm caches.
- If a later change finds more cours (`MAX_COUR_LOOKUPS`, relation types),
  this skip fires less often. No change is needed here.
- A reviewer should check that the Simkl condition is untouched and that the
  AniList condition requires `targets.includes(Provider.AniList)`, so a user
  who turned AniList off in the picker gets no AniList line.
