# Plan 003: Diary posters only fall back to a details read once Trakt's image read settles

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04cc56e..HEAD -- src/features/diary/diary-list.tsx src/state/queries/trakt.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `04cc56e`, 2026-10-26

## Why this matters

Diary rows from Trakt history arrive without poster art, because Trakt's
watched endpoints stopped returning images in 2026. Each row recovers its
poster with a small per-item Trakt image read (`useTraktMediaImages`). If that
read fails, `DiaryPoster` falls back to the full details read
(`useMediaDetailsQuery`: TMDB catalogue, credits, studios, possibly an id
bridge). The fallback condition is "Trakt returned no cover", but while the
Trakt read is still **loading** the cover is also `''`. So every artless row
with a TMDB id starts the heavy details read in parallel with the light one,
even when the light one is about to succeed. A long diary scroll turns into N
detail-sized requests nobody needed. After this plan, the details read starts
only once the Trakt read has finished without art, or never started.

## Current state

Files:

- `src/features/diary/diary-list.tsx` — `DiaryPoster` (lines ~322–332), the
  36×54 diary row poster.
- `src/state/queries/trakt.ts` — `useTraktMediaImages` (lines ~147–176), shared
  by 6 call sites; all of them destructure only `coverImage` / `backdropImage`.

`src/features/diary/diary-list.tsx` today:

```tsx
/** The 36×54 rail poster, lazily recovered when the log arrives artless. */
function DiaryPoster({ item }: { item: NormalizedMediaItem }) {
  const { coverImage: providerCover } = useTraktMediaImages(item);
  // Serializd's sparse logs carry a TMDB TV ID; reuse detail metadata only
  // when provider recovery has no art, without delaying the diary page.
  const { data: details } = useMediaDetailsQuery(
    providerCover === '' && item.externalIds.tmdb != null ? item : undefined,
  );
  const coverImage = providerCover || details?.catalogue?.coverImage || '';
  return <SmallPoster uri={coverImage} recyclingKey={item.id} size="sm" />;
}
```

`src/state/queries/trakt.ts` today:

```ts
export function useTraktMediaImages(
  item: NormalizedMediaItem | undefined,
): NormalizedMediaImages {
  const traktId = item?.externalIds.trakt;
  const type = item?.type ?? 'MOVIE';
  const missingArt = item != null && item.coverImage === '';
  const { data } = useQuery({
    queryKey: traktQueryKeys.images(type, missingArt ? traktId ?? -1 : -1),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        getMediaImages(traktDeps(), { type, traktId: traktId ?? -1 }),
        { signal },
      ),
    enabled: missingArt && traktId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (item == null || item.coverImage !== '') {
    return {
      coverImage: item?.coverImage ?? '',
      ...(item?.backdropImage != null
        ? { backdropImage: item.backdropImage }
        : {}),
    };
  }
  return data ?? { coverImage: '' };
}
```

`NormalizedMediaImages` is `{ coverImage: string; backdropImage?: string }`
(`src/lib/providers/trakt/normalize.ts:85`).

TanStack Query v5 semantics used here: `isLoading` is `isPending && isFetching`.
It is `false` for a disabled query (no Trakt id, or the item already has art)
and `false` once the query has succeeded or errored, after retries. That is
exactly "Trakt recovery is still in flight".

Conventions: React Compiler is on, so no `useMemo`/`useCallback`. Every fetch
goes through TanStack Query (AGENTS.md).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `bun typecheck`  | exit 0              |
| Lint      | `bun lint`       | exit 0              |
| All tests | `bun run test`   | all pass (never plain `bun test`) |

## Scope

**In scope**:

- `src/state/queries/trakt.ts` — `useTraktMediaImages` only
- `src/features/diary/diary-list.tsx` — `DiaryPoster` only

**Out of scope** (do NOT touch):

- The other `useTraktMediaImages` callers (`media-card.tsx`,
  `card-actions-sheet.tsx`, `watchlist-rows.tsx`, `use-card-art.ts`,
  `app/details/[provider]/[id]/index.tsx`). They keep working unchanged
  because the new field is additive.
- `useMediaDetailsQuery` / `mediaDetailsQuery` — the details read stays as it
  is. Its cache is shared with the details screen, so a fallback read still
  pays off when the row is opened.
- Adding a new lightweight TMDB image query. It isn't needed for this fix.

## Git workflow

- Branch: `perf/diary-poster-fallback`
- One commit, e.g. `perf(diary): wait for Trakt art before reading full details`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Expose "still loading" from `useTraktMediaImages`

In `src/state/queries/trakt.ts`:

- Destructure `isLoading` alongside `data` from the `useQuery` call.
- Change the return type to `NormalizedMediaImages & { loading: boolean }`.
- In the early-return branch (`item == null || item.coverImage !== ''`) add `loading: false`.
- The final return becomes `{ ...(data ?? { coverImage: '' }), loading: isLoading }`.
- Add one docblock line: `loading` is true only while the recovery read is in flight.

**Verify**: `bun typecheck` → exit 0. All six existing callers compile unchanged.

### Step 2: Gate the diary fallback on it

In `DiaryPoster` (`src/features/diary/diary-list.tsx`):

```tsx
const { coverImage: providerCover, loading } = useTraktMediaImages(item);
const { data: details } = useMediaDetailsQuery(
  providerCover === '' && !loading && item.externalIds.tmdb != null ? item : undefined,
);
```

Update the existing comment so it says the details read is the fallback once
provider recovery has finished without art. Keep it to two lines.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

No new unit test. Neither `DiaryPoster` nor `useTraktMediaImages` has a test
file, and the repo doesn't unit-test row rendering (AGENTS.md: add tests only
where the repo already tests that kind of change). `bun run test` must still
pass.

Optional manual check, if the operator has the web app running (`bun web`
plus `bun run dev:worker`) with Trakt connected: open the Diary tab with the
browser's network panel filtered to `api.themoviedb.org`. Rows whose Trakt
image read succeeds should make no TMDB `movie/` or `tv/` details request.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "!loading" src/features/diary/diary-list.tsx` → one match in `DiaryPoster`
- [ ] `git status` shows only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `useTraktMediaImages` no longer uses `useQuery` (for example, it became
  suspense-based). The `isLoading` reasoning would no longer hold.
- Any other caller fails to typecheck after Step 1.
- `DiaryPoster` already has extra gating that this plan's excerpt doesn't show.

## Maintenance notes

- The fallback now starts after the Trakt read settles, including its
  retries (up to about 3 with backoff), so a row whose Trakt read fails shows
  its poster a little later than before. That is intended: the heavy read is
  the rare path.
- If another surface adopts the same "Trakt art, else details" fallback, reuse
  `loading` the same way instead of re-deriving it.
