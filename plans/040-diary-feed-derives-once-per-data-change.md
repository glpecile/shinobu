# Plan 040: The diary feed derives its days once per data change

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Do not update `plans/README.md`: the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6f8c3aad..HEAD -- src/state/queries/use-diary-feed.ts`
> If the file changed, compare the "Current state" excerpts against the live
> code before proceeding. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `6f8c3aad`, 2026-11-26

## Why this matters

`useDiaryFeedQuery` merges and groups every loaded diary entry on every render
of the Diary screen, even when no data changed. The screen re-renders when a
card-actions sheet opens or closes and when `isFetchingNextPage` flips. Each
time, the hook returns a new `days` array, so `DiaryList` rebuilds every row and
both month calendars. `docs/solutions/diary-scroll-jank-is-row-mount-cost.md`
records this as "Still open" at about 20 ms per render on a dev build.
`PERF.md` (Data layout) says: "Make the derivation run once per data change."

The cause: the derivations sit between hook calls, and React Compiler does not
memoize a value computed between two hooks here. This repo bans `useMemo` and
`useCallback` (React Compiler memoizes), so the fix is to move the work, not to
wrap it.

## Current state

`src/state/queries/use-diary-feed.ts`, inside `useDiaryFeedQuery` (about lines
255-312):

```ts
  // Device-local zone drives day grouping + headers (plan 0016 R4).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  ...
  const query = useInfiniteQuery({
    queryKey: diaryQueryKeys.feed(active, letterboxdUsername, serializdUsername),
    queryFn: ({ pageParam, signal }) => fetchDiaryPage(queryClient, pageParam, signal),
    initialPageParam: Object.fromEntries(active.map((provider) => [provider, 1])) as DiaryCursor,
    getNextPageParam: (_last, pages) => nextDiaryCursor(pages),
    staleTime: DIARY_STALE_MS,
    enabled: active.length > 0,
  });

  const states = diaryStates(query.data?.pages ?? []);
  const merged = mergeDiaryEntries(states);
  const anilistIds = unbridgedAniListIds(merged);
  const { data: tmdbByAniList } = useQuery({
    queryKey: diaryQueryKeys.showTmdbIds(anilistIds),
    queryFn: () => showTmdbIds(queryClient, anilistIds),
    enabled: anilistIds.length > 0,
    staleTime: DIARY_STALE_MS,
    placeholderData: keepPreviousData,
  });

  const mangaList = useMangaListQuery({
    fetch: active.includes(Provider.AniList) && merged.some((entry) => entry.item.type === 'BOOK'),
  });

  return {
    days: groupDiaryEntries(
      withBridgedBooks(withShowTmdbIds(merged, tmdbByAniList), mangaList),
      timeZone,
    ),
    timeZone,
    activeProviders: active,
    entryCount: merged.length,
    isLoading: query.isLoading,
    allFailed: active.length > 0 && states.every((state) => state.failed),
    errors: states.flatMap((state) =>
      state.error == null ? [] : [{ provider: state.provider, message: state.error }],
    ),
    hasNextPage: query.hasNextPage,
    ...
```

React Compiler's output for this hook today (advisor compiled it) has no memo
guard around `diaryStates`, `mergeDiaryEntries`, `unbridgedAniListIds` or
`groupDiaryEntries`. They run on every render.

Facts you need:

- TanStack Query runs `select` again only when the query data changes or the
  `select` function identity changes. A `select` defined at module scope has a
  stable identity, so it runs once per data change. This does not depend on
  React Compiler.
- `select` on an infinite query receives `InfiniteData<DiaryPage, DiaryCursor>`
  (`{ pages, pageParams }`). `getNextPageParam` still receives the raw pages.
- `useMangaListQuery` returns a stable array while its data is unchanged.
- Repo exemplar for a module-scope function with this exact purpose:
  `src/state/queries/continue-reading.ts` `legInputs` ("Module scope ...
  `combine` runs again on every observer change, and its result keeps its
  identity while the data does").

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
| --------- | ------------------------------------------------------------- | ------------------- |
| Install   | `bun install`                                                 | exit 0              |
| Typecheck | `bun typecheck`                                               | exit 0              |
| Tests     | `bun test --isolate src/state/queries/use-diary-feed.test.ts` | all pass            |
| Lint      | `bun lint`                                                    | exit 0              |
| Memo check | see Step 3                                                   | prints `MEMOIZED`   |

## Scope

**In scope** (the only files you may modify):

- `src/state/queries/use-diary-feed.ts`
- `docs/solutions/diary-scroll-jank-is-row-mount-cost.md` (only the "Still open" note about this cost, Step 4)

**Out of scope** (do NOT touch):

- `src/features/diary/*` and `src/state/queries/diary-pages.ts`. The merge and
  group functions stay as they are. Only where they are called moves.
- `src/app/(tabs)/diary.tsx`.
- The shape of `DiaryFeedResult`. Every returned field keeps its name and type.
- `nextDiaryCursor` in `getNextPageParam`. It also runs per render. That is a
  known follow-up, not part of this plan.

## Git workflow

- You are already on branch `perf/round-6`. Do not create another branch.
- One commit for this plan: `perf(diary): derive the feed once per data change`
- End the commit message with a blank line and
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Do NOT push and do NOT open a PR.

## Steps

### Step 1: Move the page-only derivation into a module-scope `select`

In `use-diary-feed.ts`, add a module-scope function above `useDiaryFeedQuery`
and pass it as `select` to `useInfiniteQuery`:

```ts
/** Everything the feed derives from its pages alone. Module scope, so TanStack runs it once per data change. */
function selectDiaryFeed(data: InfiniteData<DiaryPage, DiaryCursor>) {
  const states = diaryStates(data.pages);
  const merged = mergeDiaryEntries(states);
  return {
    states,
    merged,
    anilistIds: unbridgedAniListIds(merged),
    hasBook: merged.some((entry) => entry.item.type === 'BOOK'),
  };
}
```

Import the `InfiniteData` type from `@tanstack/react-query`. In the hook, read
`query.data?.states`, `query.data?.merged`, `query.data?.anilistIds` and
`query.data?.hasBook`. For the no-data case, use module-scope empty constants
(for example `const NO_STATES: ReturnType<typeof diaryStates> = []`) so the
fallback keeps one identity. Do not write `?? []` inline.

`getNextPageParam: (_last, pages) => nextDiaryCursor(pages)` stays unchanged.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Compute `days` and the state-derived fields after the last hook

Keep `useQuery` (show TMDB ids) and `useMangaListQuery` as they are, fed by the
selected `anilistIds` and `hasBook`. Compute `days`, `allFailed` and `errors`
into `const`s after the last hook call and before the `return`.

**Verify**: `bun test --isolate src/state/queries/use-diary-feed.test.ts` → all pass.

### Step 3: Read the time zone through a hook, so the compiler can memoize `days`

The advisor tested this against the compiler. Steps 1 and 2 alone do not
memoize `days`. The cause is this line at the top of the hook:

```ts
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

The compiler treats `timeZone` as part of a mutable object. Passing it to
`groupDiaryEntries` after other hooks makes a memo scope that would span hook
calls, so the compiler drops the scope. A hook's return value is frozen, so
reading the zone through a hook fixes it and still reads the zone on every
render (a device time zone change is still seen on the next render).

Add at module scope, above `useDiaryFeedQuery`:

```ts
/** Read on every render: a hook's result is frozen, so React Compiler can memoize what takes it. */
function useDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

In `useDiaryFeedQuery`, replace the line above with
`const timeZone = useDeviceTimeZone();` and keep the existing comment above it
(`// Device-local zone drives day grouping + headers (plan 0016 R4).`).

Do NOT wrap the value in a template string or `String(...)`. That also
memoizes `days`, but it caches the time zone for the life of the screen.

Then prove the memo. Run from the repo root:

```sh
NODE_PATH=node_modules node -e "
const babel=require('@babel/core');const fs=require('fs');
const f='src/state/queries/use-diary-feed.ts';
const out=babel.transformSync(fs.readFileSync(f,'utf8'),{filename:f,babelrc:false,configFile:false,presets:[['@babel/preset-typescript',{isTSX:true,allExtensions:true}]],plugins:[['babel-plugin-react-compiler',{}]]}).code;
const body=out.slice(out.indexOf('function useDiaryFeedQuery'));
const ok=/\bt\d+ = groupDiaryEntries\(/.test(body)&&/!== timeZone/.test(body)&&body.includes('select: selectDiaryFeed')&&body.includes('const timeZone = useDeviceTimeZone();');
console.log(ok?'MEMOIZED':'NOT MEMOIZED');"
```

**Verify**: prints exactly `MEMOIZED`. It means: `groupDiaryEntries(` is
assigned to a compiler temporary inside a memo guard, `timeZone` is one of the
guard's dependencies (not cached forever), the `select` is the module-scope
function, and the zone is read on every render. If it prints `NOT MEMOIZED`,
STOP.

**Verify**: `bun test --isolate src/state/queries/use-diary-feed.test.ts` → all pass.

### Step 4: Update the solutions note

In `docs/solutions/diary-scroll-jank-is-row-mount-cost.md`, find the "Still
open" note that says the feed hook re-derives on every render (near lines
97-104). Replace it with two or three plain sentences: the derivation now runs
in the infinite query's `select` and after the last hook, so it runs once per
data change; `nextDiaryCursor` still runs per render through
`getNextPageParam`. Short sentences, active voice.

**Verify**: `bun lint` → exit 0.

## Test plan

No new test. `bun:test` does not run React Compiler, so a render test cannot
see this memo. Step 3 is the proof. The existing
`src/state/queries/use-diary-feed.test.ts` (5 tests) pins behaviour and must
pass unchanged. Do not edit it.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun test --isolate src/state/queries/use-diary-feed.test.ts` passes, test file unmodified
- [ ] Step 3 command prints exactly `MEMOIZED`
- [ ] `git diff --name-only HEAD~1` lists only the two in-scope files

## STOP conditions

- The hook does not match the "Current state" excerpt.
- Step 3 prints `NOT MEMOIZED`.
- An existing test fails and the fix would need a change to the test.
- You need `useMemo`, `useCallback`, `useEffect` or a module-level cache to
  pass. All are wrong for this repo.

## Maintenance notes

- A new derivation in this hook goes into `selectDiaryFeed` when it depends on
  pages only, or after the last hook when it also needs another query.
- Reviewer: check that `DiaryFeedResult` did not change and that the fallback
  constants are module-scope.
- Deferred: `nextDiaryCursor` per render.
