# Plan 010: Identity and title lookups stop caching a network failure as "no match"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/mapping.ts src/state/queries/mapping.test.ts src/lib/providers/mapping/anizip.ts src/lib/providers/mapping/anizip.test.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

`src/state/queries/mapping.ts` resolves ids across providers: a Trakt id from
a TMDB id, a TMDB id from a title, an AniList film id, a show's season layout,
an anime's prequel. Most of these queries are cached **forever**
(`staleTime`/`gcTime: Infinity`). Each `queryFn` turns **any** error into
`null` through `mappingMiss`, so a single 5xx, 429 or dropped connection is
cached as "this item has no match" for the rest of the session. Later logs of
that item then skip providers ("no Simkl-resolvable id", mapping-skips for
Trakt/Serializd) and details lose metadata, until the app restarts.

The same bug was fixed for one function in plan 002 (`fetchAniZipIds`, persist
buster v7). This plan applies the rule to the rest: only a real answer is
cached. A transient failure rejects inside the query, so nothing is cached,
and the exported `cached*` wrappers still resolve `null` to their callers.

## Current state

`src/state/queries/mapping.ts`:

```ts
function mappingMiss(error: unknown, signal: AbortSignal): null {
  if (signal.aborted) throw error;
  return null;
}
```

It is used as `.catch((error) => mappingMiss(error, signal))` in these query
functions. Run `grep -n "mappingMiss" src/state/queries/mapping.ts` and expect ~10 matches:
- season layout (TMDB and Trakt legs, ~lines 330, 347), 1-hour cache
- Trakt identity lookup (~427), forever
- movie text search, Trakt and TMDB legs (~479, ~484), forever
- TMDB `/find` by TVDB (~503), forever
- TMDB movie id by title (~531), forever
- AniList film id (~593), forever
- AniList neighbours (~603), 1-hour cache

The exported wrappers and whether they already swallow rejections:

| Wrapper | Catches today? |
|---|---|
| `cachedAniZipIds` | yes, `.catch(() => null)` (plan 002) |
| `cachedTraktLookup` | yes, rethrows only `isCancelledError` |
| `cachedSeasonLayout` | **no** |
| `cachedTmdbTvIdByTvdb` | **no** |
| `cachedTraktTextSearch` | **no** |
| `cachedTmdbMovieIdByTitle` | **no** |
| `cachedAniListFilmId` | **no** |
| `cachedAniListPrequel` / `cachedAniListLaterCours` (via `cachedAniListNeighbours`) | **no** |
| `cachedAniZipEpisodeMap` | **no** (its `queryFn` never rejects today) |

The exemplar to copy (`cachedTraktLookup`):

```ts
  return queryClient.fetchQuery(identityLookupQuery(identityLookupVia(), params)).catch((error) => {
    if (isCancelledError(error)) throw error;
    return null;
  });
```

Error classes (`src/lib/providers/errors.ts`): `ProviderRateLimitError`;
`ProviderNetworkError` with optional `status` (absent for DNS, timeout or
offline); `ProviderAuthError`; `ProviderDecodeError`. In Effect v4,
`Effect.runPromise` rejects with the error instance itself, and the repo
already relies on that with `instanceof` checks in
`src/features/log-media/simkl-write-lock.ts`.

`src/lib/providers/mapping/anizip.ts`, `fetchAniZipEpisodeMap` (~line 128):

```ts
  try {
    const response = await fetch(`${ANIZIP_MAPPINGS_URL}?${queryFor(lookup)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as AniZipEpisodesResponse;
    ...
    return map;
  } catch {
    return null;
  }
```

Plan 002 already gave the sibling `fetchAniZipIds` this shape. ani.zip answers
an unknown id with **404**. Read `fetchAniZipIds` in the same file and match it.

Decided behaviour you must keep: the episode map and season layout keep their
**1-hour** windows for real answers, including real misses. The comment above
`EPISODE_MAP_STALE_MS` records that decision. This plan only stops *failures*
from being cached.

## Commands you will need

| Purpose   | Command                                                    | Expected on success |
|-----------|------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                            | exit 0              |
| Typecheck | `bun typecheck`                                            | exit 0              |
| Tests     | `bun test src/state/queries/mapping.test.ts src/lib/providers/mapping/anizip.test.ts` | all pass |
| All tests | `bun run test`                                             | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                 | exit 0              |

## Scope

**In scope**:
- `src/state/queries/mapping.ts`
- `src/state/queries/mapping.test.ts`
- `src/lib/providers/mapping/anizip.ts`: `fetchAniZipEpisodeMap` and its docblock only
- `src/lib/providers/mapping/anizip.test.ts`: the `fetchAniZipEpisodeMap` describe only

**Out of scope**:
- Callers of the `cached*` wrappers (`features/log-media/enrich.ts`, `use-log-media.ts`, `state/queries/up-next.ts`, `media-details.ts`, …). The wrappers keep their "resolve `null`, reject only on cancel" contract.
- `simklLookupQuery` and its shared Simkl cache (already rejects on failure).
- `persist.ts`: no `BUSTER` bump is needed. Only the two ani.zip prefixes are persisted, and the episode map is time-boxed.
- Cache windows (`FOREVER`, `EPISODE_MAP_STALE_MS`).

## Git workflow

- Branch: `fix/mapping-transient-failures`
- One commit: `fix(mapping): don't cache transient lookup failures as misses`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rethrow transient failures in `mappingMiss`

```ts
/**
 * A lookup's catch: a definitive answer (auth, decode, 4xx) caches as a miss;
 * a rate limit, 5xx or network failure rethrows so nothing is cached and the
 * next caller retries. Wrappers below turn the rejection into `null`.
 */
function mappingMiss(error: unknown, signal: AbortSignal): null {
  if (signal.aborted || isTransientLookupFailure(error)) throw error;
  return null;
}

function isTransientLookupFailure(error: unknown): boolean {
  return (
    error instanceof ProviderRateLimitError ||
    (error instanceof ProviderNetworkError && (error.status == null || error.status >= 500))
  );
}
```

Import both classes from `@/lib/providers/errors`.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Keep every wrapper non-failable

For each wrapper marked **no** in the table, add the `cachedTraktLookup`
catch: reject only on `isCancelledError(error)`, otherwise resolve `null`
(`[]` for `cachedAniListLaterCours`). For the neighbours pair, catch in
`cachedAniListPrequel` and `cachedAniListLaterCours`, not inside the
private `cachedAniListNeighbours`. Factor the catch into one small local helper
(e.g. `function nullUnlessCancelled(error: unknown): null`) and use it everywhere,
including in `cachedTraktLookup`, so it exists once.

Don't touch the `useQuery` hooks that share these options
(`useMovieCatalogueQuery` and others). A transient failure there becomes a
normal query error, which TanStack retries with the app's backoff. No caller
of those hooks reads `.error`.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.
`grep -n "nullUnlessCancelled" src/state/queries/mapping.ts` → one definition
plus one use per wrapper.

### Step 3: Episode map — only 404 or "no episodes" is a miss

Rewrite `fetchAniZipEpisodeMap` to match `fetchAniZipIds`:
- remove the outer `try/catch`
- `if (response.status === 404) return null;`
- `if (!response.ok) throw new Error(\`ani.zip episodes ${response.status}\`);`
- keep `if (episodes == null) return null;` and the decode unchanged.

Update its docblock: `null` now means ani.zip confirmed there is no table, and
any other failure throws. Then make `cachedAniZipEpisodeMap` in `mapping.ts`
use the same non-failable catch as step 2.

**Verify**: `bun typecheck` → exit 0.

### Step 4: Tests

- `anizip.test.ts`: the test at ~line 146 asserts `null` for a 500, malformed
  JSON and an offline fetch. It pinned the bug. Rewrite it to:
  `await expect(fetchAniZipEpisodeMap(jsonFetch({}, false), LOOKUP)).rejects.toThrow()`
  for the 500, and the same for offline and malformed. Then add one case:
  a 404 response (`ok: false, status: 404`) resolves `null`. Build the fetch
  inline as plan 002's `fetchAniZipIds` 404 test in this file does.
- `mapping.test.ts`: add one case to the `cachedTraktLookup (plan 0034 KTD-8)`
  describe. It is the forever-cached path the bug lives on. Mirror the setup of
  `'with Trakt credentials, resolves via Trakt and never touches Simkl'` (Trakt
  credentials saved, `routes` stubbing the Trakt search-id URL):
  1. Route the Trakt lookup to status **503**. `await cachedTraktLookup(client, …)` → `null`.
  2. Re-route the same URL to a 200 with a valid single result (copy the body
     from the Trakt test above). Call again with the same client and params → non-null.
  3. Assert two requests were made to the Trakt URL (`requestedUrls`).

**Verify**: `bun test src/state/queries/mapping.test.ts src/lib/providers/mapping/anizip.test.ts` → all pass.

## Test plan

- Episode map: 404 → null; 500, offline and malformed → reject (one rewritten case plus one new case).
- Forever lookup: a 503 is not cached and the next call re-fetches (one new case).
- The existing `'a shared Simkl failure remains an error for the public lookup and a miss for identity enrichment'` must still pass.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "catch {" src/lib/providers/mapping/anizip.ts` shows no match inside `fetchAniZipEpisodeMap`
- [ ] `git status` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- An `Effect.runPromise` rejection in these paths turns out not to be the
  `Provider*Error` instance (e.g. it is wrapped). Check with a quick
  `console.log(error?.constructor?.name)` in the new test, then remove the log.
  If it is wrapped, report back. Don't unwrap it ad hoc.
- A caller outside `mapping.ts` breaks because a wrapper now rejects (it shouldn't; every wrapper catches).
- A test outside the two in-scope test files fails.

## Maintenance notes

- While a provider is down, the same lookup is retried by every log or detail
  open, instead of once per session. `fetchQuery` dedupes concurrent calls per
  key. Add a short negative cache only if outages show up as request storms.
- Any new mapping query must use `mappingMiss` in its `queryFn` and
  `nullUnlessCancelled` in its exported wrapper.
