# Plan 036: An ani.zip record with no bridge ids is asked again after a day

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/state/queries/mapping.ts src/state/queries/mapping.test.ts`
> Plan 032 changes one `select` line and one import in `mapping.ts`. That diff
> is expected. Any change to `cachedAniZipIds` or `FOREVER` is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

ani.zip maps a new release days after it premieres. Until then, a lookup by
AniList id answers 404, or a record with no TVDB and no TMDB id (The Last
Blossom, AniList 177686, on 2026-11-12: every bridge field is null). The app
caches that answer **forever** in memory, and the `['mapping', 'anizip']`
prefix is on the persisted allowlist, so the answer also comes back after
every restart. The persisted snapshot only expires when the app is not opened
for 24 hours. So a user who logs a new anime in its first week keeps the
"not mapped" answer for good, and the log keeps missing Trakt, Serializd and
Letterboxd for that title after ani.zip has mapped it. The code already
treats the Simkl fallback this way on purpose ("a premiere-day miss must not
outlive Simkl linking the show"). The ani.zip half has no such rule.

After this plan, an AniList-keyed ani.zip answer without bridge ids goes
stale after 24 hours. A mapped record still never refetches.

## Current state

### Files

- `src/state/queries/mapping.ts` — `cachedAniZipIds`, the one cached reader of
  ani.zip id records.
- `src/state/queries/persist.ts` — the persisted allowlist. Read only.
- `src/state/queries/mapping.test.ts` — tests that run the real `mapping.ts`
  against a fake `httpFetch`.

### Excerpts

`src/state/queries/mapping.ts:180-196`:

```ts
const FOREVER = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

/**
 * Resolves null on failure without caching it, so the next call retries. No
 * query retries: callers await these in sequence.
 */
export function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
    retry: false,
  }).catch(() => null);
}
```

`AniZipLookup` (`src/lib/providers/mapping/anizip.ts:21-24`):

```ts
export type AniZipLookup =
  | { anilistId: number }
  | { tvdbId: number }
  | { tmdbId: number };
```

`fetchAniZipIds` returns `null` for a 404 or an absent `mappings` block, and
an `AniZipIds` object (`{ anilist?, tvdb?, tmdb?, imdb?, mal?, type? }`)
otherwise.

`src/state/queries/persist.ts:63` and `:195-202`:

```ts
const MAX_AGE_MS = 24 * 60 * 60_000;
...
  // Identity mappings never churn (they're already `Infinity`-cached in
  // memory), and Up Next fans one per anime for cross-provider dedupe.
  ...
  ['mapping', 'anizip'],
  ['mapping', 'anizip-episodes'],
```

Callers of `cachedAniZipIds` with an `anilistId` lookup:
`src/features/log-media/enrich.ts`, `src/features/log-media/use-log-media.ts`
(two), `src/state/queries/up-next.ts:652` (one per watched anime, for
dedupe), `src/state/queries/media-details.ts`.

A comment in the same file, on `EPISODE_MAP_STALE_MS`, says the episode table
uses "One flat window for hits and misses alike — deliberately not a
content-dependent hit-long/miss-short scheme, which no query in this app
has". This plan adds a content-dependent stale time for the **id** record on
purpose. The reason: a flat window would re-download a ~1 MB ani.zip document
for every watched anime each time Up Next refreshes
(`docs/solutions/web-cors-anizip.md`), while only the unmapped records can
ever change. Update that comment's claim in step 1.

The installed TanStack Query (`@tanstack/query-core` 5.104.2) accepts a
function for `staleTime`: `(query) => number`.

### Conventions that apply

- A number in code gets a comment that says where it came from.
- Tests in `mapping.test.ts` use `freshClient()` for a `QueryClient`, fill the
  module-level `routes` array (`[urlSubstring, body, status?]`) to fake HTTP,
  and read `requestedUrls` to see what was fetched. Unmatched URLs answer 404.
  Read two existing tests in that file before writing yours.
- "Write as few tests as cover the change. One case per branch."

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck | `bun typecheck` | exit 0, no errors |
| Lint | `bun lint` | exit 0 |
| Focused tests | `bun test --isolate src/state/queries/mapping.test.ts` | all pass |
| Full tests | `bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/state/queries/mapping.ts`
- `src/state/queries/mapping.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/state/queries/persist.ts`. The allowlist and `MAX_AGE_MS` stay.
- `useAniListIdByTmdbQuery` in `mapping.ts`. It looks up by TMDB id, where a
  miss means "not an anime" for almost every title, and must stay forever.
- `episodeMapQuery` and `EPISODE_MAP_STALE_MS` values.
- `fetchAniZipIds`.

## Git workflow

- Branch: `fix/anizip-unmapped-refresh`
- One commit: `fix(mapping): ask ani.zip again for an anime it had not mapped`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Give unmapped AniList-keyed records a finite stale time

In `src/state/queries/mapping.ts`, change `cachedAniZipIds` to:

```ts
// ani.zip maps a new release within days; a day matches the persisted snapshot's age.
const UNMAPPED_STALE_MS = 24 * 60 * 60_000;

/**
 * Resolves null on failure without caching it, so the next call retries. No
 * query retries: callers await these in sequence. An AniList-keyed answer
 * with no TVDB or TMDB id is a new release ani.zip has not mapped yet, so it
 * goes stale; every other answer never churns.
 */
export function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
    staleTime: ({ state }) =>
      'anilistId' in lookup && state.data?.tvdb == null && state.data?.tmdb == null
        ? UNMAPPED_STALE_MS
        : Number.POSITIVE_INFINITY,
    retry: false,
  }).catch(() => null);
}
```

`staleTime` must come after `...FOREVER` so it overrides the spread. `gcTime`
stays infinite.

Then, in the docblock above `EPISODE_MAP_STALE_MS`, replace the words
"which no query in this app has" with "which only `cachedAniZipIds` has, for
the size reason given there".

**Verify**: `bun typecheck && bun lint` → both exit 0. If TypeScript rejects
the function form of `staleTime` on `fetchQuery`, STOP.

### Step 2: Test

Add one `describe` at the end of `src/state/queries/mapping.test.ts`, with two
tests. Import `cachedAniZipIds` the same way the file imports the other
`cached*` functions (look at the top of the file; they come from a dynamic
`await import('./mapping')`).

```ts
describe('cachedAniZipIds', () => {
  test('an unmapped AniList record is asked again after a day', async () => {
    const client = freshClient();
    client.setQueryData(mappingQueryKeys.anizip({ anilistId: 177686 }), { anilist: 177686 }, {
      updatedAt: Date.now() - 25 * 60 * 60_000,
    });
    routes = [['anilist_id=177686', { mappings: { anilist_id: 177686, themoviedb_id: '1294972' } }]];

    expect(await cachedAniZipIds(client, { anilistId: 177686 })).toMatchObject({ tmdb: 1294972 });
  });

  test('a mapped record is never asked again', async () => {
    const client = freshClient();
    client.setQueryData(mappingQueryKeys.anizip({ anilistId: 16498 }), { anilist: 16498, tvdb: 267440 }, {
      updatedAt: Date.now() - 400 * 24 * 60 * 60_000,
    });

    expect(await cachedAniZipIds(client, { anilistId: 16498 })).toEqual({ anilist: 16498, tvdb: 267440 });
    expect(requestedUrls).toHaveLength(0);
  });
});
```

Check how the file resets `routes` and `requestedUrls` between tests (a
top-level `beforeEach`). If there is none that covers a new `describe`, reset
both at the start of each of your tests.

**Verify**: `bun test --isolate src/state/queries/mapping.test.ts` → all pass,
two new tests included.

Then confirm the first new test fails without the fix: copy `mapping.ts` to a
scratch directory outside the repo, delete the `staleTime:` function from
`cachedAniZipIds`, run the file, see `an unmapped AniList record is asked
again after a day` fail, copy your version back. Never use `git stash`.

### Step 3: Full gates

**Verify**: `bun typecheck && bun lint && bun run test` → all exit 0.

## Test plan

- Two new tests in `src/state/queries/mapping.test.ts` (step 2): the stale
  branch and the forever branch.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0; both `cachedAniZipIds` tests pass
- [ ] `grep -n "UNMAPPED_STALE_MS" src/state/queries/mapping.ts | wc -l` is 2
- [ ] `git diff --stat -- src/state/queries/persist.ts` is empty
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `cachedAniZipIds` excerpt does not match the live code.
- TypeScript rejects a function for `staleTime` in `fetchQuery`.
- `mapping.test.ts` has no `freshClient`, `routes` or `requestedUrls` helper
  (the test file was restructured).
- An existing test fails after step 1.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- Cost: Up Next calls `cachedAniZipIds` once per watched anime. Each anime
  that ani.zip has not mapped now costs one ani.zip request (up to ~1 MB) per
  day instead of one ever. Mapped anime are unchanged. If a user with many
  unmapped entries reports data use, raise `UNMAPPED_STALE_MS`; do not go back
  to forever.
- A record ani.zip maps only partly (an `imdb` id but no TVDB or TMDB id)
  counts as unmapped here. That is intended: the log path needs TVDB or TMDB.
- TVDB-keyed and TMDB-keyed lookups stay forever, misses included. For those,
  a miss means "this title is not an anime" for nearly every title.
- A reviewer should check that `staleTime` sits after `...FOREVER`.
