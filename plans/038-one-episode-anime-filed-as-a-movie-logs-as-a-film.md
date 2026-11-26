# Plan 038: A one-episode anime that TMDB files as a movie logs as a film

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/enrich.ts src/features/log-media/enrich.test.ts src/features/log-media/use-log-media.ts src/features/log-media/use-log-media.test.ts`
> Plans 032, 034, 035 and 037 change these files. Their diffs are expected.
> This plan is written against the code **after plan 034**. Before you start,
> read the forward block of `enrichExternalIds` (it starts with the comment
> `// AniList-origin anime → movie/TV-side ids`) and confirm it has the
> variables `isFilm`, `bridgedTmdb`, `match`, `tvdb`, `tmdb` and `imdb` that
> plan 034's step 1 introduced. If it does not, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/034-anime-takes-a-tmdb-id-of-its-own-kind.md (must be merged first)
- **Category**: feature
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

AniList files many single works as an OVA, ONA or special with one episode.
TMDB and Letterboxd file the same work as a **movie**. Example: Voices of a
Distant Star, AniList 256 (`format: OVA`, 1 episode), TMDB movie 37910, and a
film page on Letterboxd. In the anime-lists dataset (2026-11-12), 322 AniList
entries that are not `MOVIE` and have no TVDB id carry a TMDB movie id. More
exist that ani.zip does not map at all (Undetectable Box, AniList ONA 165933,
TMDB movie 901323).

Routing decides "film or show" from `item.isFilm`, which comes from AniList's
format. So today such an entry is a **show** to the fan-out: Letterboxd is
never a target, and Trakt would be asked for a show that does not exist. The
user watched a film and cannot log it on the film tracker.

The details read already handles this for display: when its TMDB match is a
movie, it shows the entry as a film. After this plan, the log path does the
same. A one-episode entry whose TMDB identity is a movie is logged as a film:
Letterboxd and Trakt get a movie write, AniList gets `COMPLETED`.

## Current state

### Files

- `src/features/log-media/enrich.ts` — `enrichExternalIds`. Both the confirm
  sheet's target list (`useLogTargetsSplit`) and the write (`resolveLogPlan`)
  call it, so a change here reaches both.
- `src/features/log-media/use-log-media.ts` — `resolveLogPlan`, which reads
  the caller's episode input.
- `src/state/queries/mapping.ts` — `cachedTmdbAnimeMatch`. Read only.
- `src/lib/providers/pick-movie-match.ts` — `pickAnimeTmdbMatch`. Read only.
- Tests: `src/features/log-media/enrich.test.ts`,
  `src/features/log-media/use-log-media.test.ts`.

### How the pieces behave today

`item.isFilm` is set by AniList normalization only for `format === 'MOVIE'`
(`src/lib/providers/anilist/normalize.ts:147`). `item.totalEpisodes` is set
from AniList's episode count (`normalize.ts:150`).

Every consumer keys on `isFilm`:

- `src/lib/providers/routing.ts`: `animeEffectiveMovieTvType(item)` returns
  `'MOVIE'` when `item.isFilm === true`, else `'TV'`. Letterboxd handles
  `MOVIE` only.
- `src/lib/providers/trakt/writes.ts`: `isMovie = item.type === 'MOVIE' ||
(item.type === 'ANIME' && item.isFilm === true)` → a `movies[]` body.
- `src/lib/providers/letterboxd/writes.ts`: same test, then loads
  `/tmdb/{externalIds.tmdb}/`.
- `src/lib/providers/anilist/writes.ts:76`: `filmLike = item.isFilm === true
|| item.type === 'MOVIE'` → `status: 'COMPLETED'`, no progress needed.
- `src/lib/providers/simkl/writes.ts`: an anime with `isFilm === true` is
  written whole, with no episodes, under `anime[]`.

`cachedTmdbAnimeMatch(queryClient, item)` returns
`{ tmdbId: number; isFilm: boolean } | null`. Its picker
(`pickAnimeTmdbMatch`) needs the same year and a shared name, and for an
entry with `totalEpisodes === 1` that is not a film it accepts a TMDB movie
**or** a TMDB show; `isFilm` in the result says which. It returns null
without a TMDB token.

The details read (`src/state/queries/media-details.ts`, `mediaDetailsQuery`):

```ts
const tmdb = await resolveTmdbId(queryClient, item);
const isFilm = tmdb?.isFilm === true ? true : item.isFilm;
```

After plan 034, the forward block of `enrichExternalIds` ends like this:

```ts
const isFilm = item.isFilm === true;
const bridgedTmdb =
  bridged != null && aniZipTmdbKind(bridged) === (isFilm ? 'movie' : 'tv')
    ? bridged.tmdb
    : undefined;
const match = isFilm && bridgedTmdb == null ? await cachedTmdbAnimeMatch(queryClient, item) : null;
const tvdb = isFilm ? undefined : bridged?.tvdb;
const tmdb =
  match?.tmdbId ??
  (tvdb != null ? ((await cachedTmdbTvIdByTvdb(queryClient, tvdb)) ?? bridgedTmdb) : bridgedTmdb);
const imdb = isFilm || tvdb != null ? bridged?.imdb : undefined;
externalIds = { ...externalIds /* tvdb, tmdb, imdb when present */ };
```

and the function ends with `return { ...item, externalIds };`.

`src/features/log-media/use-log-media.ts:440-446` (start of `resolveLogPlan`):

```ts
let item = await enrichExternalIds(queryClient, variables.item, connected);

const canonicalInput = intendedEpisodes(variables);
const entryInput =
  variables.entryEpisodes != null && variables.entryEpisodes.length > 0
    ? variables.entryEpisodes
    : null;
```

The log for such an entry starts as an **episode** log: the trigger sends
`entryEpisodes: [1]`, because the item is not a film when the user presses
Log. With episode input, `resolveLogPlan` tries to translate episode 1 for
Trakt and reads AniList progress by episode. A film has no episodes: for an
item with `isFilm === true` both inputs must be `null`, and then the rest of
`resolveLogPlan` and `planLogWrite` already take the film paths
(`domains` both null, `providerHasWatch` uses the film checks, the rebuilt
variables carry no episode fields).

### Conventions that apply

- All film-or-show decisions stay keyed on `isFilm`. `AGENTS.md`: "All routing
  lives in `src/lib/providers/routing.ts`. Never branch on type or provider at
  a call site." Do not add a new flag or a new routing rule; set `isFilm` on
  the enriched item so every existing rule applies.
- A wrong identity is worse than none. Only a `totalEpisodes === 1` entry may
  become a film, because `COMPLETED` on AniList is only equal to "episode 1
  watched" when the entry has one episode.
- Comments say why, briefly. Tests: one case per branch, in the existing files.
- `enrich.test.ts` and `use-log-media.test.ts` fake `@/state/queries/mapping`
  with module-level variables (`anizipBridge`, `tmdbAnimeMatch`, `simklIds`
  in the first; `courIds`, `prequelIds` and others in the second). Read each
  file's `mock.module` block before you write a test.

## Commands you will need

| Purpose       | Command                                                                                                 | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| Install       | `bun install --frozen-lockfile`                                                                         | exit 0              |
| Typecheck     | `bun typecheck`                                                                                         | exit 0, no errors   |
| Lint          | `bun lint`                                                                                              | exit 0              |
| Focused tests | `bun test --isolate src/features/log-media/enrich.test.ts src/features/log-media/use-log-media.test.ts` | all pass            |
| Full tests    | `bun run test`                                                                                          | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/features/log-media/enrich.ts` (the forward block and the final `return`)
- `src/features/log-media/enrich.test.ts`
- `src/features/log-media/use-log-media.ts` (`resolveLogPlan`, the two input lines)
- `src/features/log-media/use-log-media.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/providers/routing.ts` and every `writes.ts`. They already do the
  right thing for `isFilm === true`.
- `src/lib/providers/anilist/normalize.ts`. Do not make AniList items films
  at the source: lists, Up Next and the details screen read `isFilm` too.
- `pickAnimeTmdbMatch` and `cachedTmdbAnimeMatch`.
- Entries with more than one episode. They stay as they are.
- The sheet components and the log triggers.

## Git workflow

- Branch: `feat/one-episode-anime-as-film`
- One commit: `feat(log): log a one-episode anime that TMDB files as a movie as a film`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The enrichment marks the entry as a film

In the forward block of `src/features/log-media/enrich.ts`:

1. Add, next to `const isFilm = …`:

   ```ts
   // AniList files many single works as a one-episode OVA, ONA or special;
   // TMDB and Letterboxd file them as movies.
   const single = !isFilm && item.totalEpisodes === 1;
   ```

2. Compute the movie identity of a `single` entry. It has one when the bridge
   record carries a movie id, or, with no bridge id at all, when the TMDB
   title match is a movie:

   ```ts
   const singleMovieId = !single
     ? undefined
     : bridged?.tmdb != null && aniZipTmdbKind(bridged) === 'movie'
       ? bridged.tmdb
       : bridged?.tvdb == null && bridged?.tmdb == null
         ? await cachedTmdbAnimeMatch(queryClient, item).then((found) =>
             found?.isFilm === true ? found.tmdbId : undefined,
           )
         : undefined;
   ```

   If the `bridged` type makes `aniZipTmdbKind(bridged)` not compile, follow
   the same workaround plan 034 used in this block.

3. When `singleMovieId != null`: adopt `tmdb: singleMovieId` and
   `bridged?.imdb` (a movie's IMDb id), adopt no `tvdb`, and remember that the
   item is now a film. Declare `let filedAsFilm = false;` near the top of
   `enrichExternalIds` (next to `let externalIds`), set it to `true` here, and
   skip the rest of the block's id adoption for this item (the existing
   `tvdb`/`tmdb`/`imdb` lines must not also run for it).

4. The next block in the function (`// Bridge ids → a real Trakt id`) computes
   `const kind = item.isFilm === true ? 'movie' : 'show';`. Change it to
   `const kind = item.isFilm === true || filedAsFilm ? 'movie' : 'show';`.

5. Change the final line of the function from

   ```ts
   return { ...item, externalIds };
   ```

   to

   ```ts
   return { ...item, externalIds, ...(filedAsFilm ? { isFilm: true } : {}) };
   ```

The whole forward block only runs when a movie/TV provider is connected (its
existing `if` condition). That condition lists Letterboxd only for
`item.isFilm === true`. Extend that one clause so a one-episode entry also
qualifies:

```ts
      ((item.isFilm === true || item.totalEpisodes === 1) && connected.includes(Provider.Letterboxd)))
```

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 2: A film has no episode input

In `src/features/log-media/use-log-media.ts`, `resolveLogPlan`, change the two
input lines so an item the enrichment made a film drops the caller's episode
input:

```ts
// A one-episode entry the enrichment filed as a film arrives as an episode
// log; a film has no episodes.
const film = item.isFilm === true;
const canonicalInput = film ? null : intendedEpisodes(variables);
const entryInput =
  !film && variables.entryEpisodes != null && variables.entryEpisodes.length > 0
    ? variables.entryEpisodes
    : null;
```

Read the rest of `resolveLogPlan` and `planLogWrite` and confirm, without
changing them, that with both inputs `null`:

- the `cour` lookup is skipped (`entryInput == null && item.isFilm !== true`
  is false),
- the function returns from the `if (entryInput == null)` branch with
  `domains: { canonical: null, entry: null }`,
- `planLogWrite` rebuilds the variables with no `episodes` and no
  `entryEpisodes`.

If any of those three is not true in the live code, STOP.

Check the existing test `an anime film never attempts translation`
(`use-log-media.test.ts`, about line 383): a real AniList film sent with
episode input, if that is what it does, must behave as before.

**Verify**: `bun test --isolate src/features/log-media/use-log-media.test.ts` → all existing tests pass.

### Step 3: Tests

In `src/features/log-media/enrich.test.ts`, add to the `describe` that plan
034 created (`enrichExternalIds — a bridge id of the other kind`), or create
a `describe` named `enrichExternalIds — a one-episode entry TMDB files as a
movie` if that block is missing:

```ts
const ova = (totalEpisodes: number) =>
  chao({
    id: 'anilist-256',
    type: 'ANIME',
    isFilm: false,
    totalEpisodes,
    externalIds: { anilist: 256 },
  });

test('a one-episode OVA bridged to a movie becomes a film', async () => {
  anizipBridge = { anilist: 256, tmdb: 37910, imdb: 'tt0370754' };
  const enriched = await enrichExternalIds(client, ova(1), ['letterboxd']);
  anizipBridge = null;
  expect(enriched.isFilm).toBe(true);
  expect(enriched.externalIds).toEqual({ anilist: 256, tmdb: 37910, imdb: 'tt0370754' });
});

test('an unmapped one-episode ONA takes a TMDB movie match, never a show match', async () => {
  tmdbAnimeMatch = { tmdbId: 901323, isFilm: true };
  const film = await enrichExternalIds(client, ova(1), ['letterboxd']);
  tmdbAnimeMatch = { tmdbId: 5, isFilm: false };
  const show = await enrichExternalIds(client, ova(1), ['letterboxd']);
  tmdbAnimeMatch = null;
  expect(film).toMatchObject({ isFilm: true, externalIds: { tmdb: 901323 } });
  expect(show.isFilm).toBe(false);
  expect(show.externalIds.tmdb).toBeUndefined();
});

test('a two-episode OVA bridged to a movie stays a series', async () => {
  anizipBridge = { anilist: 256, tmdb: 37910 };
  const enriched = await enrichExternalIds(client, ova(2), ['trakt']);
  anizipBridge = null;
  expect(enriched.isFilm).toBe(false);
  expect(enriched.externalIds).toEqual({ anilist: 256 });
});
```

Make sure `simklIds` is `null` for these tests (set it in the block's
`beforeEach`), because the fake Simkl bridge would otherwise supply TV ids.

In `src/features/log-media/use-log-media.test.ts`, add one test inside
`describe('planLogWrite — entry → canonical translation (plan 0027 U3)', …)`.
Its fake `cachedAniZipIds` returns `courIds.get(anilistId) ?? prequelIds`, so
set `courIds` for the fixture and reset it after:

```ts
test('a one-episode entry filed as a TMDB movie plans a film log', async () => {
  courIds = new Map([[256, { anilist: 256, tmdb: 37910 }]]);
  const queryClient = client();
  const item: NormalizedMediaItem = {
    id: 'anilist-256',
    title: 'Voices of a Distant Star',
    coverImage: '',
    type: 'ANIME',
    totalEpisodes: 1,
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: '',
    externalIds: { anilist: 256 },
  };

  const plan = await planLogWrite(queryClient, { item, entryEpisodes: [1] }, [
    'anilist',
    'letterboxd',
  ]);
  courIds = new Map();

  expect(plan.targets).toEqual(['anilist', 'letterboxd']);
  expect(plan.variables.item.isFilm).toBe(true);
  expect(plan.variables.entryEpisodes).toBeUndefined();
  expect(plan.variables.episodes).toBeUndefined();
});
```

This test needs the watch-state reads for AniList and Letterboxd not to hit
the network. Look at how the neighbouring tests seed them (`seedAniList`,
and the Letterboxd tests near the top of the file). Seed what is needed in
the same way. `providerHasWatch` treats a failed read as "does not have it",
so an unseeded read must still not make the test fail; if it does, seed it.
The test platform must allow a Letterboxd write: check how the existing test
`a Letterboxd film the member page already shows is logged again as a
rewatch` sets `process.env.EXPO_OS`, and do the same.

**Verify**: `bun test --isolate src/features/log-media/enrich.test.ts src/features/log-media/use-log-media.test.ts` → all pass, four new tests included.

### Step 4: Full gates

**Verify**: `bun typecheck && bun lint && bun run test` → all exit 0.

### Step 5 (optional evidence): See it on a device

Only if a simulator with signed-in AniList and Letterboxd accounts is
available. Otherwise skip and say so in your report. Do **not** confirm the
write: it changes real accounts.

1. Search for "Voices of a Distant Star" and open the AniList result.
2. Open the log sheet.
3. Expected: "Write to" lists Letterboxd. Close the sheet without logging.

## Test plan

- Three new tests in `enrich.test.ts` (bridge movie id, title match movie vs
  show, more than one episode).
- One new test in `use-log-media.test.ts` (the plan drops the episode input).
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0; the four new tests pass
- [ ] `grep -n "filedAsFilm" src/features/log-media/enrich.ts | wc -l` is 4 or more
- [ ] `git diff --stat -- src/lib/providers/routing.ts src/lib/providers/anilist/normalize.ts` is empty
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The forward block of `enrichExternalIds` is not in the shape plan 034 left
  it (see the drift check).
- With both episode inputs `null`, `resolveLogPlan` or `planLogWrite` does not
  take the film paths described in step 2.
- An existing test fails and the fix would need a change to its expectations.
- The fix appears to need a change in `routing.ts`, a `writes.ts` file, or a
  sheet component.
- You find a caller that reads `item.isFilm` on the **un-enriched** item
  during a log and would now disagree with the enriched one in a way that
  changes a write (for example a trigger that sends `tags` only for films).
  Report it; do not patch the caller.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- The item the user sees stays an "episode 1" entry on lists and in the sheet
  title. Only the write treats it as a film. If that mismatch is reported as
  confusing, the place to change is the trigger's copy, not this rule.
- AniList: the write sets `COMPLETED` without a progress value. For a
  one-episode entry that is the same fact as "episode 1 watched". This is why
  the rule is limited to `totalEpisodes === 1`.
- Without a TMDB token, only bridge-mapped entries (ani.zip or Simkl gave a
  movie id) become films. Unmapped ones stay as they are.
- A rewatch of such an entry now bumps AniList's `repeat` (the film path)
  instead of setting `REPEATING` at episode 1.
- A reviewer should check: the entry never adopts a `tvdb` id when it becomes
  a film, the Trakt id lookup uses `kind: 'movie'` for it, and
  `use-log-targets.ts` needed no change (it calls the same enrichment).
- Plan 039 shows a "no match" row for a provider that still cannot be
  reached. After this plan fewer entries land there.
