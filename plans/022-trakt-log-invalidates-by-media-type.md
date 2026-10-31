# Plan 022: A Trakt log refreshes the watched library for its own media type only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/features/log-media/use-log-media.ts src/features/log-media/invalidate-after-log.test.ts`
> Plan 018 edits the Letterboxd branch of the same function. That diff is
> expected. Any change to the Trakt branch is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/018-letterboxd-film-watch-invalidation-scoped.md (same function; land 018 first)
- **Category**: perf
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

After every successful Trakt log, `invalidateAfterLog` invalidates **both**
whole-library reads: `watchedShows()` (also the Up Next pool) and
`watchedMovies()`. An episode can't change the watched-movies library, and a
film can't change watched shows. When a movie-bearing screen (a list,
filmography or movie detail) is mounted underneath, every episode log
re-downloads the full watched-movies library, and every film log re-downloads
watched shows. The catch-up chain pays this once per episode. After this
plan, film-like logs refresh `watchedMovies` and everything else refreshes `watchedShows`.

## Current state

`src/features/log-media/use-log-media.ts`, `invalidateAfterLog` (~line 652):

```ts
  if (succeeded.includes('trakt')) {
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchedShows() });
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchedMovies() });
    // Trakt removes a watched item from the watchlist server-side — ...
    queryClient.invalidateQueries({ queryKey: traktQueryKeys.watchlistRoot() });
    const traktId = item.externalIds.trakt;
    if (traktId != null) {
      // TV logs also change this show's seasons/progress views (plan 0010).
      queryClient.invalidateQueries({ queryKey: traktQueryKeys.showProgress(traktId) });
    }
  }
```

The film-like rule used elsewhere in the codebase (e.g. `letterboxdFilmWatchQuery`
in `src/state/queries/letterboxd.ts`): `item.type === 'MOVIE' || item.isFilm === true`.
Anime films carry `isFilm` and route to movie targets (AGENTS.md).

Test: `src/features/log-media/invalidate-after-log.test.ts`, `recordingClient()`
records invalidated keys as `'a/b/c'` strings. `ITEM` is a `TV` item with
`externalIds: { trakt: 1, anilist: 9 }`.

## Commands you will need

| Purpose   | Command                                                         | Expected on success |
|-----------|-----------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                                 | exit 0              |
| Typecheck | `bun typecheck`                                                 | exit 0              |
| One file  | `bun test src/features/log-media/invalidate-after-log.test.ts`  | all pass            |
| All tests | `bun run test`                                                  | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                      | exit 0              |

## Scope

**In scope**: the Trakt branch of `invalidateAfterLog`; `invalidate-after-log.test.ts`.

**Out of scope**: the diary invalidation (see "Findings considered and
rejected" in `plans/README.md` for why it stays as is), the other provider
branches, and the up-next ordering rule ("**Last on purpose**" comment).

## Git workflow

- Branch: `perf/trakt-log-invalidation`
- One commit: `perf(log): refresh only the Trakt library a log can change`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split by media type

```ts
  if (succeeded.includes('trakt')) {
    // A film can't change watched shows and an episode can't change watched
    // movies; both are whole-library reads.
    const filmLike = item.type === 'MOVIE' || item.isFilm === true;
    queryClient.invalidateQueries({
      queryKey: filmLike ? traktQueryKeys.watchedMovies() : traktQueryKeys.watchedShows(),
    });
    ... (watchlist invalidation unchanged)
    const traktId = item.externalIds.trakt;
    if (!filmLike && traktId != null) {
      queryClient.invalidateQueries({ queryKey: traktQueryKeys.showProgress(traktId) });
    }
  }
```

Keep the existing comments for the watchlist and show-progress lines.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 2: Tests

- If an existing case asserts `trakt/watched-movies` for the TV `ITEM`, it pinned
  the over-invalidation: change it to `not.toContain`.
- Extend the existing `'a successful Trakt log recomputes Up Next and refreshes the watchlist'`
  case with `expect(keys).toContain('trakt/watched-shows')` and
  `expect(keys).not.toContain('trakt/watched-movies')`. Confirm the literal
  key segments by reading `traktQueryKeys` in `src/state/queries/trakt.ts`.
- Add **one** case for a film: `invalidateAfterLog(client, { ...ITEM, type: 'MOVIE' }, ['trakt'])`
  → contains `trakt/watched-movies`, and contains neither `trakt/watched-shows`
  nor `trakt/show-progress/1`.

**Verify**: `bun test src/features/log-media/invalidate-after-log.test.ts` → all pass.

## Test plan

- TV branch: extended existing case. Film branch: one new case.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] Only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Something downstream reads `watchedShows` to decide a **movie's** state, or
  `watchedMovies` for a show's. Check with
  `grep -rn "watchedShows()\|watchedMovies()" src --include=*.ts --include=*.tsx | grep -v test`
  and read each consumer.
- `showProgress` is read for films anywhere (it shouldn't be).

## Maintenance notes

- If Trakt ever auto-adds a show to "watched" from a movie log (e.g. a
  franchise feature), revisit.
