# Plan 034: An AniList anime takes a TMDB id only when the id is of its own kind

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/enrich.ts src/features/log-media/enrich.test.ts src/state/queries/media-details.ts src/lib/providers/mapping/anizip.ts`
> Plan 032 lands first and changes `enrich.ts` (the reverse map near the end
> of the function, plus one import), `enrich.test.ts` (the `anizipBridge`
> fixture type and one test) and `anizip.ts` (adds `aniZipTmdbKind`). Those
> diffs are expected. Any change to the block this plan edits (it starts with
> the comment `// AniList-origin anime → movie/TV-side ids`) is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/032-movie-never-takes-a-tv-anime-anilist-id.md (adds `aniZipTmdbKind`; must be merged first)
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

ani.zip keeps one `themoviedb_id` per anime and does not say if it is a TMDB
movie id or a TMDB TV id. The two id spaces share numbers. When a log starts
from an AniList anime, the enrichment takes that id by the **item's** kind:

- An AniList **film** uses it as a movie id. In the anime-lists dataset
  (2026-11-12), 677 of about 1,600 mapped AniList films carry a **TV** id,
  because TMDB and TVDB file the film as a special of a show. Example: Blood:
  The Last Vampire, AniList 405, ani.zip `themoviedb_id: "19849"`,
  `thetvdb_id: 78960`. The Letterboxd write then loads
  `letterboxd.com/tmdb/19849/`, which is whatever film has movie id 19849, or
  no film. The Trakt lookup asks for movie 19849 in the same way. The log
  goes to the wrong film or fails.
- An AniList **OVA, ONA or special** with no TVDB id uses it as a show id. 322
  of 328 such records carry a **movie** id. Example: Voices of a Distant
  Star, AniList 256, `themoviedb_id: "37910"`, no TVDB id. The Trakt lookup
  and the season layout then read TMDB **TV** 37910, a different show.

After this plan, the enrichment and the details read adopt ani.zip's TMDB id
only when `aniZipTmdbKind` says it is of the item's kind. A film whose
bridge id is not a movie id takes the TMDB title match instead, or no TMDB id.

## Current state

### The kind rule (added by plan 032)

`src/lib/providers/mapping/anizip.ts` exports, after plan 032:

```ts
export function aniZipTmdbKind(ids: { tvdb?: number | undefined }): 'movie' | 'tv' {
  return ids.tvdb != null ? 'tv' : 'movie';
}
```

Evidence for the rule, from the anime-lists dataset on 2026-11-12 (entries
with an AniList id and a TMDB id):

| ani.zip record      | TMDB id is a TV id | TMDB id is a movie id |
| ------------------- | -----------------: | --------------------: |
| has `thetvdb_id`    |              6,953 |                   253 |
| has no `thetvdb_id` |                  8 |                 1,066 |

If `aniZipTmdbKind` does not exist in `anizip.ts`, plan 032 has not landed:
STOP.

### Files

- `src/features/log-media/enrich.ts` — `enrichExternalIds`. The forward block
  (AniList anime → movie/TV ids) has the bug.
- `src/state/queries/media-details.ts` — `resolveTmdbId`, the details read's
  copy of the same rule.
- `src/state/queries/mapping.ts` — `cachedTmdbAnimeMatch`, the strict TMDB
  title-and-year match. Read only.
- `src/features/log-media/enrich.test.ts` — tests.

### Excerpts

`src/features/log-media/enrich.ts:69-121` at commit `04643c8` (the forward
block; this plan rewrites the part from `const bridged` to the end of the
`if (mapped != null)` body):

```ts
// AniList-origin anime → movie/TV-side ids (only useful when a movie/TV
// provider is connected). ...
if (
  isAnime &&
  externalIds.anilist != null &&
  externalIds.trakt == null &&
  externalIds.tmdb == null &&
  externalIds.tvdb == null &&
  (connected.includes(Provider.Trakt) ||
    connected.includes(Provider.Serializd) ||
    connected.includes(Provider.Simkl) ||
    (item.isFilm === true && connected.includes(Provider.Letterboxd)))
) {
  const anizip = await cachedAniZipIds(queryClient, {
    anilistId: externalIds.anilist,
  });
  // ani.zip lags a new release by days, and Simkl often links it already.
  const simkl =
    anizip?.tvdb != null || anizip?.tmdb != null
      ? null
      : await cachedSimklAnimeIds(queryClient, { anilist: externalIds.anilist });
  const bridged = simkl?.tvdb != null || simkl?.tmdb != null ? simkl : anizip;
  // Neither maps some new films (The Last Blossom, 2025), so a film takes
  // the details read's TMDB title match. A series doesn't: a wrong show
  // would get Trakt and Serializd writes with no ani.zip episode table.
  const match =
    item.isFilm === true && bridged?.tvdb == null && bridged?.tmdb == null
      ? await cachedTmdbAnimeMatch(queryClient, item)
      : null;
  const mapped = match != null ? { ...bridged, tmdb: match.tmdbId } : bridged;
  if (mapped != null) {
    // ani.zip's `themoviedb_id` can name a TMDB id that doesn't exist (a
    // sequel cour's own id), so a series takes TVDB → TMDB like the details
    // read does, and keeps ani.zip's only when that misses.
    const tmdb =
      item.isFilm !== true && mapped.tvdb != null
        ? ((await cachedTmdbTvIdByTvdb(queryClient, mapped.tvdb)) ?? mapped.tmdb)
        : mapped.tmdb;
    externalIds = {
      ...externalIds,
      ...(mapped.tvdb != null ? { tvdb: mapped.tvdb } : {}),
      ...(tmdb != null ? { tmdb } : {}),
      ...(mapped.imdb != null ? { imdb: mapped.imdb } : {}),
    };
  }
}
```

`cachedTmdbAnimeMatch` (`src/state/queries/mapping.ts:616-635`) searches TMDB
by the item's English title, accepts only one record with the same year and a
shared name, and for a film accepts only a TMDB **movie**. It returns
`{ tmdbId, isFilm } | null`, and `null` without a TMDB token. So its id is
always of the right kind for a film.

`src/state/queries/media-details.ts:96-104` (inside `resolveTmdbId`):

```ts
const ids = await cachedAniZipIds(queryClient, {
  anilistId: item.externalIds.anilist,
});
if (item.isFilm === true && ids?.tmdb != null) return { tmdbId: ids.tmdb };
if (item.isFilm !== true && ids?.tvdb != null) {
  const tmdbId = await cachedTmdbTvIdByTvdb(queryClient, ids.tvdb);
  if (tmdbId != null) return { tmdbId };
}
return (await cachedTmdbAnimeMatch(queryClient, item)) ?? undefined;
```

### Conventions that apply

- Comments say why, never restate the code, and never describe the old
  version (`AGENTS.md`, "Comments").
- "Write as few tests as cover the change. One case per branch." Extend
  `enrich.test.ts`; do not create a new test file.
- `enrich.test.ts` fakes `@/state/queries/mapping` with `mock.module`. The
  fake's `cachedAniZipIds` returns the module-level `anizipBridge` when set,
  `cachedTmdbAnimeMatch` returns `tmdbAnimeMatch`, `cachedTmdbTvIdByTvdb`
  returns `tmdbByTvdb`, `cachedSimklAnimeIds` returns `simklIds`. Tests set
  these variables and must reset them to `null` before they end, because the
  variables are shared by every test in the file.
- A wrong identity is worse than none
  (`docs/solutions/trakt-text-search-wrong-movie-match.md`). When the kind is
  not certain and nothing confirms it, adopt no TMDB id.

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

- `src/features/log-media/enrich.ts` (the forward block only)
- `src/features/log-media/enrich.test.ts`
- `src/state/queries/media-details.ts` (one condition in `resolveTmdbId`)
- `docs/solutions/anizip-tmdb-id-has-no-kind.md` (append a short section; plan 032 creates the file)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- The reverse map at the end of `enrichExternalIds` (plan 032 owns it).
- `src/lib/providers/routing.ts`. Routing stays id-driven.
- `cachedTmdbAnimeMatch` and `pickAnimeTmdbMatch`. Do not loosen the match.
- Treating a one-episode OVA or ONA as a film. Plan 038 does that. In this
  plan such an item simply adopts no TMDB id.
- `src/features/log-media/use-log-media.ts`, including `canonicalCourEntry`
  and `entryEpisodeMap`, which read ani.zip `tvdb` ids only.

## Git workflow

- Branch: `fix/anime-tmdb-id-kind`
- One commit: `fix(log): take ani.zip's TMDB id only when its kind matches the anime`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite the tail of the forward block in `enrich.ts`

Keep everything up to and including the line
`const bridged = simkl?.tvdb != null || simkl?.tmdb != null ? simkl : anizip;`.
Replace the rest of the block (from the comment `// Neither maps some new
films` through the closing brace of `if (mapped != null) { … }`) with code of
this shape:

```ts
const isFilm = item.isFilm === true;
// The bridge gives one TMDB id without its kind (aniZipTmdbKind): a film
// filed as a show's special carries the show's TV id.
const bridgedTmdb =
  bridged != null && aniZipTmdbKind(bridged) === (isFilm ? 'movie' : 'tv')
    ? bridged.tmdb
    : undefined;
// A film with no movie id takes the details read's TMDB title match
// (The Last Blossom, 2025). A series doesn't: a wrong show would get
// Trakt and Serializd writes with no ani.zip episode table.
const match = isFilm && bridgedTmdb == null ? await cachedTmdbAnimeMatch(queryClient, item) : null;
// A film's TVDB id names its parent show, never the film.
const tvdb = isFilm ? undefined : bridged?.tvdb;
// ani.zip's `themoviedb_id` can name a TMDB id that doesn't exist (a
// sequel cour's own id), so a series takes TVDB → TMDB like the details
// read does, and keeps ani.zip's only when that misses.
const tmdb =
  match?.tmdbId ??
  (tvdb != null ? ((await cachedTmdbTvIdByTvdb(queryClient, tvdb)) ?? bridgedTmdb) : bridgedTmdb);
// A non-film without a TVDB id is bridged to a movie: none of its ids is a show's.
const imdb = isFilm || tvdb != null ? bridged?.imdb : undefined;
externalIds = {
  ...externalIds,
  ...(tvdb != null ? { tvdb } : {}),
  ...(tmdb != null ? { tmdb } : {}),
  ...(imdb != null ? { imdb } : {}),
};
```

Notes for getting it exactly right:

- `aniZipTmdbKind` is already imported in this file by plan 032.
- `bridged` is either the ani.zip record or Simkl's id bag. Both have optional
  `tvdb`, `tmdb` and `imdb`. If TypeScript rejects `aniZipTmdbKind(bridged)`
  because of the Simkl type, do not cast: read `bridged.tvdb` into a local
  first and pass `{ tvdb }`.
- The behaviour table you are implementing:

  | Item       | Bridge has TVDB id   | Result                                                                               |
  | ---------- | -------------------- | ------------------------------------------------------------------------------------ |
  | film       | no                   | `tmdb` = bridge's id (a movie id). No title match call.                              |
  | film       | yes                  | `tmdb` = title match id, or none. `tvdb` not adopted. `imdb` adopted.                |
  | film       | no bridge ids at all | `tmdb` = title match id, or none (unchanged behaviour).                              |
  | not a film | yes                  | `tvdb` adopted. `tmdb` = TVDB → TMDB lookup, else bridge's id (unchanged behaviour). |
  | not a film | no                   | nothing adopted from the bridge.                                                     |

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 2: The details read uses the same rule

In `src/state/queries/media-details.ts`, `resolveTmdbId`, change

```ts
if (item.isFilm === true && ids?.tmdb != null) return { tmdbId: ids.tmdb };
```

to

```ts
if (item.isFilm === true && ids?.tmdb != null && aniZipTmdbKind(ids) === 'movie')
  return { tmdbId: ids.tmdb };
```

and import `aniZipTmdbKind` from `@/lib/providers/mapping/anizip`. A film whose
record has a TVDB id now falls through to the last line,
`cachedTmdbAnimeMatch`, which is already there. Update the function's docblock
sentence "Anime films map straight through ani.zip's own TMDB (movie) id" to
say this holds only when the record has no TVDB id.

**Verify**: `bun typecheck` → exit 0.

### Step 3: Tests in `enrich.test.ts`

Add one `describe` after the existing
`describe('enrichExternalIds — an anime film no bridge maps', …)`. Model the
fixtures on that block. Three tests, one per new branch:

```ts
// Blood: The Last Vampire (AniList 405): ani.zip's 19849 is the TMDB *TV* id
// of the show the film is a special of. Voices of a Distant Star (AniList
// 256, an OVA): its 37910 is a TMDB *movie* id.
describe('enrichExternalIds — a bridge id of the other kind', () => {
  beforeEach(() => {
    simklIds = null;
    tmdbAnimeMatch = null;
    tmdbByTvdb = null;
  });

  const film = () =>
    chao({ id: 'anilist-405', type: 'ANIME', isFilm: true, externalIds: { anilist: 405 } });

  test('a film tied to a TVDB show takes the title match, not the show’s id', async () => {
    anizipBridge = { anilist: 405, tvdb: 78960, tmdb: 19849 };
    tmdbAnimeMatch = { tmdbId: 919, isFilm: true };
    const enriched = await enrichExternalIds(client, film(), ['letterboxd']);
    anizipBridge = null;
    tmdbAnimeMatch = null;
    expect(enriched.externalIds).toMatchObject({ anilist: 405, tmdb: 919 });
    expect(enriched.externalIds.tvdb).toBeUndefined();
  });

  test('with no title match it takes no TMDB id', async () => {
    anizipBridge = { anilist: 405, tvdb: 78960, tmdb: 19849 };
    const enriched = await enrichExternalIds(client, film(), ['letterboxd']);
    anizipBridge = null;
    expect(enriched.externalIds.tmdb).toBeUndefined();
  });

  test('an OVA with no TVDB id never uses a movie id as a show id', async () => {
    anizipBridge = { anilist: 256, tmdb: 37910, imdb: 'tt0370754' };
    const enriched = await enrichExternalIds(
      client,
      chao({ id: 'anilist-256', type: 'ANIME', isFilm: false, externalIds: { anilist: 256 } }),
      ['trakt', 'serializd'],
    );
    anizipBridge = null;
    expect(enriched.externalIds).toEqual({ anilist: 256 });
  });
});
```

The number 919 is a placeholder movie id for the fake; it does not need to be
real. Existing tests that must still pass without edits: `a series anime takes
its TMDB id from TVDB over ani.zip’s`, `an AniList anime takes its TV ids from
Simkl`, `takes the TMDB title match`, `a series ignores it`.

**Verify**: `bun test --isolate src/features/log-media/enrich.test.ts` → all
pass, three new tests included.

Then confirm the three new tests fail without the fix: copy `enrich.ts` to a
scratch directory outside the repo, restore the old tail of the block from
the excerpt above, run the file, see the three fail, copy your version back.
Never use `git stash`.

### Step 4: Extend the solution doc

Append a section "The other direction" to
`docs/solutions/anizip-tmdb-id-has-no-kind.md` (created by plan 032): the
Blood: The Last Vampire and Voices of a Distant Star examples, and that
`enrich.ts` and `media-details.ts` adopt the id only for the matching kind.
Ten lines at most.

**Verify**: `grep -c "Voices of a Distant Star" docs/solutions/anizip-tmdb-id-has-no-kind.md` → `1` or more.

### Step 5: Full gates

**Verify**: `bun typecheck && bun lint && bun run test` → all exit 0.

## Test plan

- Three new tests in `src/features/log-media/enrich.test.ts` (step 3).
- No test for `media-details.ts`: `resolveTmdbId` is not exported and
  `src/state/queries/media-details.test.ts` does not cover it today. Do not
  export it to test it.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0; the three tests in `a bridge id of the other kind` pass
- [ ] `grep -n "aniZipTmdbKind" src/features/log-media/enrich.ts | wc -l` is 2 or more (reverse map from plan 032, forward block from this plan)
- [ ] `grep -n "aniZipTmdbKind" src/state/queries/media-details.ts` returns a match
- [ ] `grep -n "const mapped = match" src/features/log-media/enrich.ts` returns no matches
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `aniZipTmdbKind` is not exported from `src/lib/providers/mapping/anizip.ts`
  (plan 032 has not landed).
- The forward block in `enrich.ts` does not match the excerpt.
- An existing test in `enrich.test.ts` or `use-log-media.test.ts` fails after
  step 1 and the fix would need a change to that test's expected ids. Report
  the test name and the ids. Do not edit an existing expectation.
- A verification fails twice after a reasonable fix attempt.
- The change appears to need an edit in `routing.ts` or `use-log-media.ts`.

## Maintenance notes

- This change hot reloads. No native rebuild.
- Without a TMDB token (`EXPO_PUBLIC_TMDB_TOKEN` or a user token),
  `cachedTmdbAnimeMatch` returns null, so every film whose bridge record has
  a TVDB id gets no TMDB id. About 180 of those ids were correct movie ids
  (Mugen Train, AniList 112151). That is the accepted cost: there is no way
  to tell them from the 675 TV ids without TMDB.
- With a token, a correct movie id on a TVDB-tied record is recovered only
  when the title match finds it (same year and a shared name). If users report
  a known film missing Letterboxd, look at `pickAnimeTmdbMatch` first.
- A film now never adopts a TVDB id. Before, a film with only a TVDB id was
  routed to Letterboxd and Trakt and failed there. Now it logs to AniList and
  Simkl only. Plan 039 shows a "no match" row for the absent providers.
- Plan 038 builds on the "not a film, no TVDB id" row of the table: it treats
  a one-episode entry there as a film.
- A reviewer should check the table in step 1 row by row against the code,
  and that the Simkl bridge (`simklIds` in tests) still feeds a new series
  its TV ids.
