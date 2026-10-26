# Plan 001: AniList diary keeps paginating past entries it filters out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04cc56e..HEAD -- src/lib/providers/anilist/reads.ts src/state/queries/use-diary-feed.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `04cc56e`, 2026-10-26

## Why this matters

The unified diary (Diary tab) pages through each provider 50 rows at a time
and treats a page with fewer than 50 entries as "end of history". For AniList,
the 50 raw activities are filtered **before** that length check: "plans to
watch", "paused", "dropped" and similar activities are dropped in
normalization. One such activity in a user's newest 50 makes page 1 shorter
than 50, so the diary stops asking AniList for more and all older AniList
history is unreachable. The fix is to decide "is there another page" from
AniList's own `pageInfo.hasNextPage`, not from the filtered length.

## Current state

Files:

- `src/lib/providers/anilist/reads.ts` — AniList GraphQL reads. `getListActivity`
  (around lines 155–207) fetches one page of the viewer's list activity and
  returns already-filtered diary entries.
- `src/state/queries/use-diary-feed.ts` — the diary query layer. `pageAfter`
  (line ~60) decides the next page from entry count; `fetchAniListActivityPage`
  (line ~69) wraps `getListActivity`; `FETCH_SLICE.anilist` (line ~100) uses it
  for the diary; `useFilmPlaysQuery` (line ~276) also calls
  `fetchAniListActivityPage(queryClient, 1, anilist, signal)` for one film's plays.

`src/lib/providers/anilist/reads.ts` today:

```ts
interface ListActivityResponse {
  Page: {
    activities: Array<AniListListActivity | null> | null;
  } | null;
}

export function getListActivity(
  deps: AniListDeps,
  /** `mediaId` narrows to one title's activity; omitted, it drops out of the body. */
  params: { viewerId: number; page: number; perPage?: number; mediaId?: number },
): Effect.Effect<NormalizedDiaryEntry[], ProviderError> {
  const perPage = params.perPage ?? 50;
  return anilistAuthedRequest<ListActivityResponse>(
    deps,
    `query ($userId: Int, $mediaId: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        activities(userId: $userId, mediaId: $mediaId, type: MEDIA_LIST, sort: ID_DESC) {
          ... on ListActivity {
          ...
  ).pipe(
    Effect.map((data) =>
      (data.Page?.activities ?? [])
        .filter((activity): activity is AniListListActivity => activity != null)
        .map((activity) => normalizeListActivity(activity))
        .filter((entry): entry is NormalizedDiaryEntry => entry != null),
    ),
  );
}
```

`normalizeListActivity` (in `src/lib/providers/anilist/normalize.ts:310`)
returns `null` unless the status matches
`/^(watched|rewatched|read|reread|completed)/i` — that is the filtering.

`src/state/queries/use-diary-feed.ts` today:

```ts
/** A short final page signals end-of-history; a full page has a successor. */
function pageAfter(entries: NormalizedDiaryEntry[], page: number) {
  return entries.length < PAGE_SIZE ? undefined : page + 1;
}

async function fetchAniListActivityPage(
  queryClient: QueryClient,
  page: number,
  mediaId?: number,
  signal?: AbortSignal,
): Promise<NormalizedDiaryEntry[]> {
  ...
  return Effect.runPromise(
    getListActivity(deps, { viewerId: viewer.id, page, perPage: PAGE_SIZE, mediaId }),
    { signal },
  );
}

  anilist: async (queryClient, page, signal) => {
    const entries = await fetchAniListActivityPage(queryClient, page, undefined, signal);
    return { entries, next: pageAfter(entries, page) };
  },
```

`pageAfter` stays correct for Trakt (`FETCH_SLICE.trakt`), whose history is not
filtered — leave Trakt alone.

Conventions:

- AniList pagination must use `pageInfo.hasNextPage`, never totals or counts
  (`docs/plans/0080-anilist-query-budget.md`: "use `pageInfo.hasNextPage`, not
  inaccurate totals or guesses from item count"). The seasonal read already
  does this: see `TrendingResponse` in `reads.ts`
  (`Page: { media: ...; pageInfo?: { hasNextPage: boolean } }`).
- Effect stays inside `src/lib/providers/` and `src/state/queries/`; components
  never see an `Effect` (AGENTS.md).
- Comments describe how a thing is used; don't describe the old behaviour.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `bun typecheck`                                | exit 0, no errors   |
| One test  | `bun test src/lib/providers/anilist/reads.test.ts` | all pass        |
| All tests | `bun run test`                                 | all pass (never plain `bun test`; the script adds `--isolate`) |
| Lint      | `bun lint`                                     | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/providers/anilist/reads.ts`
- `src/state/queries/use-diary-feed.ts`
- `src/lib/providers/anilist/reads.test.ts` (create)

**Out of scope** (do NOT touch):

- `src/lib/providers/anilist/normalize.ts` — the status filter is correct; the
  diary is meant to hide planning/paused/dropped activity.
- `pageAfter` and `FETCH_SLICE.trakt` — Trakt history is unfiltered.
- `src/features/diary/merge.ts` / `src/state/queries/diary-pages.ts` — the
  cursor/watermark logic is not part of this bug.
- `perPage` / `PAGE_SIZE` values — they are tuned to AniList's 30 req/min budget.

## Git workflow

- Branch: `fix/anilist-diary-pagination`
- One commit, Conventional Commits, e.g.
  `fix(diary): page AniList history by hasNextPage, not filtered length`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Return `hasNextPage` from `getListActivity`

In `src/lib/providers/anilist/reads.ts`:

1. Add `pageInfo?: { hasNextPage: boolean } | null;` to `ListActivityResponse['Page']`.
2. Add `pageInfo { hasNextPage }` inside `Page(page: $page, perPage: $perPage) { ... }`
   in the GraphQL string, before `activities(...)`.
3. Change the return type to
   `Effect.Effect<{ entries: NormalizedDiaryEntry[]; hasNextPage: boolean }, ProviderError>`
   and the `Effect.map` to return
   `{ entries: <the existing filtered array>, hasNextPage: data.Page?.pageInfo?.hasNextPage === true }`.
4. Update the docblock's last sentence if needed so it says the page reports
   whether AniList has another page (one short sentence).

**Verify**: `bun typecheck` → fails only in `src/state/queries/use-diary-feed.ts`
(the callers you fix next). Any error in another file is a STOP condition.

### Step 2: Use it in the diary query layer

In `src/state/queries/use-diary-feed.ts`:

1. `fetchAniListActivityPage` returns
   `Promise<{ entries: NormalizedDiaryEntry[]; hasNextPage: boolean }>`.
2. `FETCH_SLICE.anilist` becomes:

   ```ts
   anilist: async (queryClient, page, signal) => {
     const { entries, hasNextPage } = await fetchAniListActivityPage(queryClient, page, undefined, signal);
     return { entries, next: hasNextPage ? page + 1 : undefined };
   },
   ```

3. In `useFilmPlaysQuery`, the AniList branch keeps returning an array:
   `fetchAniListActivityPage(queryClient, 1, anilist, signal).then((result) => result.entries)`.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Add the regression test

Create `src/lib/providers/anilist/reads.test.ts`, modelled on
`src/lib/providers/anilist/episodes.test.ts` (same imports: `bun:test`,
`Effect`, `HttpFetch`; same `DEPS` shape). `getListActivity` uses an
authenticated request, so give `DEPS.tokens.get` a session:
copy the `fakeTokens()` helper from `src/lib/providers/anilist/http.test.ts:8-15`
(`get: () => ({ accessToken: 'tok' })`, typed as `TokenStore`).

One test: the fetch returns a page whose `pageInfo.hasNextPage` is `true` and
whose `activities` are one `PLANNING`-style activity (status `"plans to watch"`)
plus one watched activity (status `"watched episode"`, progress `"1"`, a
`createdAt`, and a minimal `media` object — copy the media shape from an
existing case in `src/lib/providers/anilist/normalize.test.ts`). Assert the
result is `{ entries: [one entry], hasNextPage: true }` (check
`entries.length === 1` and `hasNextPage === true`).

**Verify**: `bun test src/lib/providers/anilist/reads.test.ts` → 1 pass.

## Test plan

- New: `src/lib/providers/anilist/reads.test.ts`, one case — a filtered page
  still reports `hasNextPage: true`. That is the regression.
- Existing `src/state/queries/use-diary-feed.test.ts` must still pass unchanged.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0, including the new `reads.test.ts` case
- [ ] `grep -n "pageAfter(entries, page)" src/state/queries/use-diary-feed.ts` shows exactly one match (Trakt only)
- [ ] `git status` shows only the three in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `getListActivity` or `fetchAniListActivityPage` has a caller not listed in
  "Current state" (`grep -rn "getListActivity\|fetchAniListActivityPage" src`).
- `anilistAuthedRequest` cannot be satisfied with a fake session in a unit test
  without mocking modules (`mock.module`) — report instead of adding module mocks
  (see `docs/solutions/bun-mock-module-leaks-across-suites.md`).
- The verification in Step 1 shows type errors outside `use-diary-feed.ts`.

## Maintenance notes

- A page can now be empty but still have a successor (50 planning
  activities). `watermarkProviders` in `src/features/diary/merge.ts` only
  advances providers with zero entries once no provider with entries has more,
  so such an AniList user's diary reaches older AniList history after the
  other providers are exhausted. That is acceptable; revisit only if users
  report AniList history appearing late.
- Reviewers: confirm Trakt still uses `pageAfter`, and the film-plays branch
  still yields an array.
