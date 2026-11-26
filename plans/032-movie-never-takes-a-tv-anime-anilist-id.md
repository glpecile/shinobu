# Plan 032: A movie never takes a TV anime's AniList id from ani.zip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/enrich.ts src/features/log-media/enrich.test.ts src/lib/providers/mapping/anizip.ts src/lib/providers/mapping/anizip.test.ts src/state/queries/mapping.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

ani.zip keeps one `themoviedb_id` per anime and does not say if it is a TMDB
movie id or a TMDB TV id. TMDB movie ids and TV ids share one number space.
The log enrichment asks ani.zip "which anime has TMDB id N?" for a **movie**
and takes the answer without a kind check. A live probe on 2026-11-12 shows
the collision: `https://api.ani.zip/mappings?themoviedb_id=1429` returns
Attack on Titan (AniList 16498, `type: "TV"`, `thetvdb_id: 267440`). TMDB
movie 1429 is a different, live-action film. A user with AniList connected who
logs that film gets `externalIds.anilist = 16498`. Routing then adds AniList
as a target, and `logToAniList` sets the anime to `COMPLETED`
(`src/lib/providers/anilist/writes.ts:76`, `filmLike` is true for
`item.type === 'MOVIE'`). That is a write to the wrong title.

After this plan, a movie takes ani.zip's AniList id only when the ani.zip
record's TMDB id can be a movie id.

## Current state

### The rule that tells the kind

ani.zip serves the community anime-lists dataset
(`https://github.com/Fribb/anime-lists`). That dataset stores the kind
(`{"tv": 1429}` or `{"movie": [635302]}`), but ani.zip flattens it to one
value. The dataset, counted on 2026-11-12 for entries with an AniList id and a
TMDB id:

| ani.zip record      | TMDB id is a TV id | TMDB id is a movie id |
| ------------------- | -----------------: | --------------------: |
| has `thetvdb_id`    |              6,953 |                   253 |
| has no `thetvdb_id` |                  8 |                 1,066 |

So: **a record with a TVDB id carries a TV id (96.5%), and a record without a
TVDB id carries a movie id (99.3%).** `mappings.type` does not tell the kind:
675 records with `type: "MOVIE"` carry a TV id (the film is a special of a
TVDB show, for example Blood: The Last Vampire, AniList 405, TMDB TV 19849).

The 253 movie ids that sit on a record with a TVDB id (for example Mugen
Train, AniList 112151, TMDB movie 635302, TVDB 348545) are treated as "kind
unknown" by this rule. That is the safe side: the enrichment has title
fallbacks after the ani.zip step, and the repo's rule is that a wrong identity
is worse than none (`docs/solutions/trakt-text-search-wrong-movie-match.md`).

### Files

- `src/lib/providers/mapping/anizip.ts` — the ani.zip fetch and the
  `AniZipIds` type. Pure, no session imports. The new helper goes here.
- `src/features/log-media/enrich.ts` — `enrichExternalIds`, the id enrichment
  every log runs before routing. Contains the bug.
- `src/state/queries/mapping.ts` — `useAniListIdByTmdbQuery`, a details-screen
  hook that reads the same ani.zip answer and already has a (weaker) kind check.
- `src/features/log-media/enrich.test.ts` — tests for `enrichExternalIds`.
- `src/lib/providers/mapping/anizip.test.ts` — tests for `anizip.ts`.

### Excerpts

`src/lib/providers/mapping/anizip.ts:11-19`:

```ts
export interface AniZipIds {
  anilist?: number;
  tvdb?: number;
  tmdb?: number;
  imdb?: string;
  mal?: number;
  /** "TV" | "MOVIE" | … as anime-lists classifies it. */
  type?: string;
}
```

`src/features/log-media/enrich.ts:141-160` (the bug, the reverse map):

```ts
// Trakt-origin movie/TV → reverse-map into AniList's world, which also
// names the cour Simkl tracks a later season under.
if (
  isMovieTv &&
  externalIds.anilist == null &&
  (connected.includes(Provider.AniList) || connected.includes(Provider.Simkl))
) {
  const lookup: AniZipLookup | null =
    item.type === 'TV' && externalIds.tvdb != null
      ? { tvdbId: externalIds.tvdb }
      : item.type === 'MOVIE' && externalIds.tmdb != null
        ? { tmdbId: externalIds.tmdb }
        : null;
  if (lookup != null) {
    const mapped = await cachedAniZipIds(queryClient, lookup);
    if (mapped?.anilist != null) {
      externalIds = { ...externalIds, anilist: mapped.anilist };
    }
  }
}
```

Two fallbacks follow this block in the same function and stay as they are:
`cachedAniListFilmId` (AniList film search, exact year) and
`cachedAniListIdByTitle` (title and year, animated titles only). A movie that
this plan stops mapping through ani.zip still reaches them.

`src/state/queries/mapping.ts:238-249` (the hook with the weaker check):

```ts
export function useAniListIdByTmdbQuery(item: NormalizedMediaItem) {
  const { tmdb, anilist } = item.externalIds;
  const lookup = { tmdbId: tmdb ?? 0 };
  const isMovie = item.type === 'MOVIE';
  const enabled = tmdb != null && anilist == null && isAnimated(item);
  const mapped = useQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
    enabled,
    select: (ids) => (ids?.anilist != null && (ids.type === 'MOVIE') === isMovie ? ids.anilist : null),
  });
```

### Conventions that apply

- Comments say how a thing is used or why, never restate the code. Put the
  reason on the function docblock. Keep them short.
- Tests: "Write as few tests as cover the change. One case per branch."
  (`AGENTS.md`). Do not add a test for a branch an existing test already pins.
- `enrich.test.ts` fakes the whole module `@/state/queries/mapping` with
  `mock.module`. `anizip.ts` is **not** faked, so a pure helper there runs for
  real in that suite.
- A non-obvious network fact gets a file in `docs/solutions/` (`AGENTS.md`:
  "Write every network anomaly or non-obvious fix there right away").

## Commands you will need

| Purpose       | Command                                                                                                                               | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install       | `bun install --frozen-lockfile`                                                                                                       | exit 0              |
| Typecheck     | `bun typecheck`                                                                                                                       | exit 0, no errors   |
| Lint          | `bun lint`                                                                                                                            | exit 0              |
| Focused tests | `bun test --isolate src/features/log-media/enrich.test.ts src/lib/providers/mapping/anizip.test.ts src/state/queries/mapping.test.ts` | all pass            |
| Full tests    | `bun run test`                                                                                                                        | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/lib/providers/mapping/anizip.ts`
- `src/lib/providers/mapping/anizip.test.ts`
- `src/features/log-media/enrich.ts`
- `src/features/log-media/enrich.test.ts`
- `src/state/queries/mapping.ts` (only the `select` line of `useAniListIdByTmdbQuery`)
- `docs/solutions/anizip-tmdb-id-has-no-kind.md` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- The forward direction in `enrich.ts` (the block that starts with the comment
  `// AniList-origin anime → movie/TV-side ids`). Plan 034 changes it.
- `src/state/queries/media-details.ts`. Plan 034 changes it.
- `fetchAniZipIds` itself. Do not change what it decodes.
- The `TV` branch of the reverse map. A TVDB lookup has no id collision.

## Git workflow

- Branch: `fix/movie-anilist-id-kind`
- One commit: `fix(log): keep a movie from taking a TV anime's AniList id`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the kind helper to `anizip.ts`

Add this export below the `AniZipIds` interface in
`src/lib/providers/mapping/anizip.ts`:

```ts
/**
 * Which TMDB id space a record's `tmdb` is in. ani.zip keeps one TMDB id per
 * anime without its kind, and movie and TV ids share numbers. A record tied
 * to a TVDB show carries that show's TV id, a film filed as its special
 * included; a record without one carries a movie id
 * (docs/solutions/anizip-tmdb-id-has-no-kind.md).
 */
export function aniZipTmdbKind(ids: { tvdb?: number | undefined }): 'movie' | 'tv' {
  return ids.tvdb != null ? 'tv' : 'movie';
}
```

**Verify**: `bun typecheck` → exit 0.

### Step 2: Use it in the reverse map

In `src/features/log-media/enrich.ts`, import `aniZipTmdbKind` from
`@/lib/providers/mapping/anizip` (the file already imports the `AniZipLookup`
type from there; make it one import statement with a value import and an
inline `type` for `AniZipLookup`).

Change the inner condition of the reverse map from:

```ts
      if (mapped?.anilist != null) {
```

to:

```ts
      // A TMDB lookup also answers for a TV anime that has the movie's number.
      if (mapped?.anilist != null && (item.type !== 'MOVIE' || aniZipTmdbKind(mapped) === 'movie')) {
```

Change nothing else in that block.

**Verify**: `bun typecheck` → exit 0.

### Step 3: Use it in the details hook

In `src/state/queries/mapping.ts`, `useAniListIdByTmdbQuery`, replace the
`select` line with:

```ts
    select: (ids) => (ids?.anilist != null && aniZipTmdbKind(ids) === (isMovie ? 'movie' : 'tv') ? ids.anilist : null),
```

Add `aniZipTmdbKind` to the existing import from
`@/lib/providers/mapping/anizip` in that file. Update the hook's docblock
sentence "so ani.zip's `type` has to agree with the item's" to say the kind
comes from `aniZipTmdbKind`.

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 4: Tests

In `src/features/log-media/enrich.test.ts`:

1. Widen the fixture so a test can give the fake ani.zip record a TVDB id and
   an AniList id. Change

   ```ts
   let anizipBridge: { tvdb: number; tmdb: number } | null = null;
   ```

   to

   ```ts
   let anizipBridge: AniZipIds | null = null;
   ```

   and add `import type { AniZipIds } from '@/lib/providers/mapping/anizip';`.

2. Add one test inside the existing
   `describe('enrichExternalIds — anime film AniList fallback', …)`:

   ```ts
   // TMDB movie 1429 shares its number with Attack on Titan's TV id.
   test('ignores an ani.zip record whose TMDB id is a TV id', async () => {
     anizipBridge = { anilist: 16498, tvdb: 267440, tmdb: 1429 };

     const enriched = await enrichExternalIds(
       client,
       chao({ externalIds: { trakt: 1, tmdb: 1429 } }),
       ALL,
     );
     anizipBridge = null;

     expect(enriched.externalIds.anilist).toBeUndefined();
   });
   ```

   The existing test `skips the search entirely when ani.zip already resolved
the id` already pins the accepted branch (a record with no TVDB id). Do not
   add a second one.

In `src/lib/providers/mapping/anizip.test.ts`: do **not** add a test for
`aniZipTmdbKind`. It is a one-line rule and the enrich test covers both
results.

**Verify**: `bun test --isolate src/features/log-media/enrich.test.ts src/state/queries/mapping.test.ts` → all pass, including the new test.

Then confirm the new test fails without the fix: copy `enrich.ts` to a
scratch directory outside the repo, remove the `aniZipTmdbKind` condition from
step 2, run the enrich test file and see the new test fail, then copy the file
back. Never use `git stash` for this.

### Step 5: Record the anomaly

Create `docs/solutions/anizip-tmdb-id-has-no-kind.md` with:

- The symptom: a TMDB movie resolves to a TV anime with the same number, with
  the 1429 → Attack on Titan example and the date 2026-11-12.
- The cause: anime-lists stores `{"tv": N}` or `{"movie": [N]}`, ani.zip
  flattens it, and `type: "MOVIE"` does not tell the kind (675 film records
  carry a TV id).
- The table from "The rule that tells the kind" above.
- The fix: `aniZipTmdbKind` in `src/lib/providers/mapping/anizip.ts`, and that
  every reader of an ani.zip `tmdb` must ask it.

Keep the file under 40 lines. Match the tone of
`docs/solutions/anizip-misses-anime-films-by-tmdb-id.md`.

**Verify**: `test -f docs/solutions/anizip-tmdb-id-has-no-kind.md && echo ok` → `ok`.

### Step 6: Full gates

**Verify**: `bun typecheck && bun lint && bun run test` → all exit 0.

## Test plan

- One new test in `src/features/log-media/enrich.test.ts` (step 4), modelled
  on the tests in the same `describe`.
- No other new tests.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0 and the test `ignores an ani.zip record whose TMDB id is a TV id` passes
- [ ] `grep -n "aniZipTmdbKind" src/features/log-media/enrich.ts src/state/queries/mapping.ts src/lib/providers/mapping/anizip.ts` shows one use in each file
- [ ] `grep -n "ids.type === 'MOVIE'" src/state/queries/mapping.ts` returns no matches
- [ ] `docs/solutions/anizip-tmdb-id-has-no-kind.md` exists
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `src/state/queries/mapping.test.ts` has a test that fails after step 3 and
  the failure is not about the `type` field of a fixture. Report the test name.
- A verification fails twice after a reasonable fix attempt.
- The fix appears to need a change to `fetchAniZipIds` or to routing.

## Maintenance notes

- This change hot reloads. No native rebuild.
- Plan 034 uses `aniZipTmdbKind` for the other direction (an AniList anime
  taking a TMDB id). Land this plan first.
- A reviewer should check that the `TV` branch of the reverse map is
  unchanged and that no other condition moved.
- Known cost: about 250 anime films whose ani.zip record has both a TVDB id
  and a real movie id (Mugen Train) no longer map through ani.zip in this
  direction. They fall to the AniList film search by title and exact year.
  If a real film is reported missing AniList after this change, the answer is
  a kind-aware source, not removing the check.
- A cached wrong AniList id from before this fix lives only in memory
  (`externalIds` are recomputed per log), so there is nothing to migrate.
