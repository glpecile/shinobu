# Plan 002: A failed ani.zip lookup is retried, not cached as "no mapping"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04cc56e..HEAD -- src/lib/providers/mapping/anizip.ts src/lib/providers/mapping/anizip.test.ts src/state/queries/mapping.ts`
> If any of these changed since this plan was written, compare the "Current
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

Shinobu logs an anime to Trakt and Serializd only if it can map the AniList id
to TMDB/TVDB ids, which it gets from ani.zip (`api.ani.zip/mappings`).
`fetchAniZipIds` returns `null` for **every** failure — a real "unknown id",
but also a network error, a 5xx, or a 429. The result is cached with
`staleTime: Infinity` and `gcTime: Infinity`, and the `['mapping','anizip']`
prefix is persisted to disk for 24 h. So one network blip makes that anime
look unmappable for the rest of the session and the next day: every later log
of it silently skips Trakt and Serializd. They aren't targets at all, so no
failure or manual link is shown. After this plan, only a confirmed miss is
cached; a failed lookup is not cached and the next caller tries again.

## Current state

Files:

- `src/lib/providers/mapping/anizip.ts` — ani.zip client. `fetchAniZipIds`
  (lines ~80–110) is the identity lookup.
- `src/lib/providers/mapping/anizip.test.ts` — its tests (`describe('fetchAniZipIds …')`
  near line 154; `jsonFetch(body, ok)` helper near line 88 returns status 200 or 500).
- `src/state/queries/mapping.ts` — TanStack wrappers. `cachedAniZipIds`
  (line ~172) and `useAniListIdByTmdbQuery` (line ~186) both use
  `fetchAniZipIds` as the `queryFn`.

`src/lib/providers/mapping/anizip.ts` today:

```ts
/**
 * One mapping lookup, deliberately *not* an Effect and *not* failable: a
 * mapping miss (unknown id, non-anime, network hiccup) degrades to `null`,
 * which downstream reads as "this item only exists on its origin provider" —
 * the fan-out then simply doesn't widen (plan 0011 decision 5). Responses can
 * be ~1 MB (the per-episode table); only `mappings` is decoded. Callers cache
 * results (mappings don't churn) — see `features/log-media/enrich.ts`.
 */
export async function fetchAniZipIds(
  fetch: HttpFetch,
  lookup: AniZipLookup,
): Promise<AniZipIds | null> {
  try {
    const response = await fetch(`${ANIZIP_MAPPINGS_URL}?${queryFor(lookup)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as AniZipResponse;
    const mappings = body.mappings;
    if (mappings == null) return null;
    ...
  } catch {
    return null;
  }
}
```

`src/state/queries/mapping.ts` today:

```ts
const FOREVER = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

export function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
  });
}
```

Facts this plan relies on (verified 2026-10-26):

- ani.zip answers an unknown id with **HTTP 404**
  (`/mappings?anilist_id=999999999` and `?themoviedb_id=999999999` both → 404).
- `queryClient.fetchQuery` defaults to `retry: false`
  (`node_modules/@tanstack/query-core/build/modern/queryClient.js`, "retries are
  disabled by default here"). If the `queryFn` throws, the query has no data,
  so the next `fetchQuery` for that key fetches again.
- The persister writes only `status === 'success'` queries
  (`shouldPersistQuery` in `src/state/queries/persist.ts`), so a failed lookup
  is never written to disk.
- `cachedAniZipIds` callers all expect `null` and never a rejection:
  `src/features/log-media/enrich.ts:83,132`, `src/features/log-media/use-log-media.ts:333`,
  `src/state/queries/up-next.ts:647` (inside `Effect.promise`, where a rejection
  would be a defect), and `src/state/queries/media-details.ts:93` (already
  `.catch(() => null)`). Several test files stub `cachedAniZipIds` with
  `mock.module`; they don't call the real function.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `bun typecheck`                                      | exit 0              |
| One file  | `bun test src/lib/providers/mapping/anizip.test.ts`  | all pass            |
| All tests | `bun run test`                                       | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                           | exit 0              |

## Scope

**In scope**:

- `src/lib/providers/mapping/anizip.ts` — `fetchAniZipIds` and its docblock only
- `src/lib/providers/mapping/anizip.test.ts`
- `src/state/queries/mapping.ts` — `cachedAniZipIds` only

**Out of scope** (do NOT touch):

- `fetchAniZipEpisodeMap` and `episodeMapQuery` — the episode map has a
  deliberate 1-hour window for hits and misses alike (see the comment above
  `EPISODE_MAP_STALE_MS` in `mapping.ts`). That is a recorded decision.
- `useAniListIdByTmdbQuery` — no edit needed. Once `fetchAniZipIds` throws, it
  becomes a normal query error that TanStack retries with the app's backoff,
  and its `select` simply doesn't run.
- Every caller of `cachedAniZipIds` — the contract "never rejects" is kept.
- The persisted prefix list in `src/state/queries/persist.ts`.

## Git workflow

- Branch: `fix/anizip-transient-failures`
- One commit, e.g. `fix(mapping): don't cache failed ani.zip lookups as misses`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Only a confirmed miss returns `null`

Rewrite `fetchAniZipIds` in `src/lib/providers/mapping/anizip.ts`:

- Remove the `try { … } catch { return null; }` wrapper, so network and JSON
  errors propagate.
- `if (response.status === 404) return null;` — ani.zip's "unknown id".
- `if (!response.ok) throw new Error(\`ani.zip mappings ${response.status}\`);`
- Keep `if (mappings == null) return null;` and the decode exactly as they are.
- Rewrite the docblock: `null` means ani.zip confirmed there is no mapping
  (404 or no `mappings` block); any other failure throws so callers don't
  cache it. Keep the sentences about the ~1 MB payload and about callers
  caching. Remove "network hiccup" from the list of misses.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Keep `cachedAniZipIds` non-failable

In `src/state/queries/mapping.ts`, make the function return
`queryClient.fetchQuery({ … }).catch(() => null)`. Add one short line above it
(or extend its docblock, if you add one) saying it resolves `null` on failure
without caching it, so the next call retries.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Tests

In `src/lib/providers/mapping/anizip.test.ts`, inside the existing
`describe('fetchAniZipIds …')` block, add exactly two cases:

1. A 404 response → resolves `null`. Build the fetch inline like `jsonFetch`
   does, with `ok: false, status: 404`.
2. A 503 response → rejects:
   `await expect(fetchAniZipIds(<fetch with ok: false, status: 503>, LOOKUP)).rejects.toThrow()`.

If an existing `fetchAniZipIds` test now fails because it expected `null` from
a 500 or a thrown fetch, that test pinned the bug: change its expectation to a
rejection rather than adding another case. Don't touch `fetchAniZipEpisodeMap`
tests.

**Verify**: `bun test src/lib/providers/mapping/anizip.test.ts` → all pass.

## Test plan

- 404 → `null` (cacheable miss); 503 → rejects (not cached). One case per branch.
- No query-layer test: the `.catch` is a pass-through, and the repo doesn't
  test pass-throughs (AGENTS.md "Tests").
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0, with the two new cases
- [ ] `grep -n "catch {" src/lib/providers/mapping/anizip.ts` shows no match inside `fetchAniZipIds` (the episode-map function may keep its own)
- [ ] `git status` shows only the three in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- A caller of `fetchAniZipIds` other than the two in `mapping.ts` exists
  (`grep -rn "fetchAniZipIds" src --exclude-dir=node_modules | grep -v test`).
- ani.zip turns out to answer an unknown id with something other than 404
  (e.g. a 200 with an empty body) — check one live call with
  `curl -s -o /dev/null -w "%{http_code}" "https://api.ani.zip/mappings?anilist_id=999999999"`;
  expect `404`.
- Making `cachedAniZipIds` catch would hide a rejection a caller relies on
  (none known).

## Maintenance notes

- With no cached result, a lookup that keeps failing (ani.zip down) is
  re-fetched by every log and Up Next pass. That's one GET per anime per
  pass, and `fetchQuery` dedupes concurrent calls for the same key, so it's
  acceptable. Add a short negative cache only if ani.zip outages show up as load.
- Reviewers: confirm `fetchAniZipEpisodeMap` is unchanged, and that the 404
  branch comes before the `!ok` throw.
