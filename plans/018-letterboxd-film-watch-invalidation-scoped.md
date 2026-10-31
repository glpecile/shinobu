# Plan 018: A Letterboxd log refreshes the logged film's watch state, not every film's

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/log-media/use-log-media.ts src/features/log-media/invalidate-after-log.test.ts src/state/queries/letterboxd.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 022 edits the same function; land this first)
- **Category**: perf
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Letterboxd has no API. Shinobu learns whether the user watched a film by
downloading and parsing that film's member HTML page, one query per film
(`letterboxdFilmWatchQuery`). List screens, filmographies and credit
timelines mount one per visible film. After **any** successful Letterboxd log,
`invalidateAfterLog` invalidates the whole `['letterboxd','film-watch']` root.
Every mounted film-watch query is active, so a list of 100 films re-downloads
100 HTML pages because one film changed. They queue behind a 4-permit
semaphore and compete with the next screen's reads. After this plan only the
logged film's entries are invalidated.

## Current state

`src/state/queries/letterboxd.ts`, key builders:

```ts
  filmWatchesRoot: () => [...letterboxdQueryKeys.all, 'film-watch'] as const,
  filmWatch: (username: string, item: NormalizedMediaItem) => [...letterboxdQueryKeys.filmWatchesRoot(), username, item.externalIds.letterboxd ?? null, item.externalIds.letterboxd == null ? item.externalIds.tmdb ?? null : null] as const,
  slug: (tmdbId: number) => [...letterboxdQueryKeys.all, 'slug', tmdbId] as const,
```

So a film-watch key is `['letterboxd','film-watch', username, slug | null, tmdb | null]`.
When a slug is known the last segment is `null`. Otherwise it holds the TMDB id.
The same film can therefore sit under a slug key (from one screen) **and** a
TMDB key (from another). `letterboxdSlugQuery(tmdb)` caches the TMDB→slug
mapping under `letterboxdQueryKeys.slug(tmdb)`.

`src/features/log-media/use-log-media.ts`, `invalidateAfterLog` (~line 652):

```ts
  if (succeeded.includes('letterboxd')) {
    queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.filmWatchesRoot() });
    // A pre-write RSS response must not repopulate the shared input as fresh.
    void queryClient.cancelQueries({ queryKey: DIARY_QUERY_ROOT });
    void queryClient.cancelQueries({ queryKey: letterboxdQueryKeys.diaryRoot() });
    queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.diaryRoot(), refetchType: 'none' });
  }
```

`item` here is the *enriched* item (it may carry `externalIds.letterboxd` and/or `externalIds.tmdb`).
`getLetterboxdUsername()` (`@/state/session/letterboxd`) is already imported in this file.

Test file: `src/features/log-media/invalidate-after-log.test.ts`.
The case `'a Simkl-only film log makes provider and gathered caches stale without a derived removal'`
shows the pattern: a real `QueryClient`, `setQueryData` on several keys, then
`getQueryState(key)?.isInvalidated`.

## Commands you will need

| Purpose   | Command                                                         | Expected on success |
|-----------|-----------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                                 | exit 0              |
| Typecheck | `bun typecheck`                                                 | exit 0              |
| One file  | `bun test src/features/log-media/invalidate-after-log.test.ts`  | all pass            |
| All tests | `bun run test`                                                  | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                      | exit 0              |

## Scope

**In scope**: `src/features/log-media/use-log-media.ts` (the Letterboxd branch
of `invalidateAfterLog` only), `src/features/log-media/invalidate-after-log.test.ts`.

**Out of scope**: the diary cancellations and invalidation in the same branch;
`letterboxd.ts` key builders; the watchlist-media invalidation (a separate verb).

## Git workflow

- Branch: `perf/letterboxd-watch-invalidation`
- One commit: `perf(log): invalidate only the logged film's Letterboxd watch`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Predicate invalidation

Replace the root invalidation with:

```ts
    // Only this film's watch reads changed. The root holds one HTML-scrape
    // query per film on every mounted list, so invalidating it refetched them all.
    const tmdb = item.externalIds.tmdb ?? null;
    const slug =
      item.externalIds.letterboxd ??
      (tmdb != null ? queryClient.getQueryData<string | null>(letterboxdQueryKeys.slug(tmdb)) ?? null : null);
    queryClient.invalidateQueries({
      queryKey: letterboxdQueryKeys.filmWatchesRoot(),
      predicate: ({ queryKey }) =>
        (slug != null && queryKey[3] === slug) || (tmdb != null && queryKey[4] === tmdb),
    });
```

Check the slug query's data type by reading `letterboxdSlugQuery` in
`letterboxd.ts`. If it isn't `string | null`, adapt the generic.

Not filtering by username is deliberate. Only the connected account's
entries are mounted, and matching on film identity alone keeps the predicate simple.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 2: Test

Add one test to `invalidate-after-log.test.ts`:

- Real `new QueryClient()`.
- Seed three film-watch keys:
  - `['letterboxd','film-watch','u','inception',null]` (the logged film by slug)
  - `['letterboxd','film-watch','u',null,27205]` (the same film by TMDB id)
  - `['letterboxd','film-watch','u','heat',null]` (another film)
- Call `invalidateAfterLog(client, { ...ITEM, type: 'MOVIE', externalIds: { letterboxd: 'inception', tmdb: 27205 } }, ['letterboxd'])`.
- Expect the first two `isInvalidated === true` and the third `false`. Then `client.clear()`.

Build the keys with `letterboxdQueryKeys.filmWatchesRoot()` spread plus literals,
importing `letterboxdQueryKeys` with `await import('@/state/queries/letterboxd')`
after the mocks, like the existing `watchlistQueryKeys` import.

**Verify**: `bun test src/features/log-media/invalidate-after-log.test.ts` → all pass.

## Test plan

- One case covering slug match, TMDB match and a non-match.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] `grep -n "filmWatchesRoot() })" src/features/log-media/use-log-media.ts` → no match (no bare root invalidation)
- [ ] Only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `filmWatch` key shape differs from `[root…, username, slug|null, tmdb|null]`.
- Another log path (catch-up chain, Letterboxd completion offer) relies on the
  root invalidation to refresh a *different* film. Search for
  `filmWatchesRoot` across `src/` and read each hit before step 1.

## Maintenance notes

- If the film-watch key gains segments, update the predicate indices together with the key builder.
