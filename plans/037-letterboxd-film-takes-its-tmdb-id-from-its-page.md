# Plan 037: A Letterboxd film with only a slug takes its TMDB id from its film page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 04643c8..HEAD -- src/features/log-media/enrich.ts src/features/log-media/enrich.test.ts src/state/queries/letterboxd.ts`
> Plans 032 and 034 change other blocks of `enrich.ts` and add tests to
> `enrich.test.ts`. Those diffs are expected. A change to the first block of
> `enrichExternalIds` (the one that calls `cachedTraktTextSearch`) or to
> `letterboxdFilmQuery` is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches the same files as 032 and 034; land after them to avoid a rebase)
- **Category**: bug
- **Planned at**: commit `04643c8`, 2026-11-12

## Why this matters

A film that comes from Letterboxd (the watchlist, a list) is only a slug, a
title and a year. To log it on Trakt or Simkl too, the enrichment needs a
TMDB id, and today it gets one from a **title and year text search**. That
search can pick no film (two candidates) or, for a film with no year, the top
hit. Letterboxd's own film page already states the exact TMDB id and its kind
in `<body data-tmdb-id="…" data-tmdb-type="movie|tv">`, and the app already
reads and caches that page (`letterboxdFilmQuery`, persisted). The details
read uses it; the log path does not.

The page also tells when Letterboxd files a **TV series** as a film
(`data-tmdb-type="tv"`). Such an item has no movie identity on other
providers, and the text search would look for a movie that does not exist.

After this plan, a slug-only film first asks its cached film page. The text
search stays as the fallback when the page read fails or gives no id.

## Current state

### Files

- `src/features/log-media/enrich.ts` — `enrichExternalIds`. The first block
  resolves ids for a movie that has none.
- `src/state/queries/letterboxd.ts` — `letterboxdFilmQuery(slug, hasTmdb)`,
  the cached film-page read. The new accessor goes here.
- `src/lib/providers/letterboxd/film.ts` — `getFilmItem`, what the query
  runs. Read only.
- `src/features/log-media/enrich.test.ts` — tests.

### Excerpts

`src/features/log-media/enrich.ts:27-68` (start of the function and the first
block):

```ts
export async function enrichExternalIds(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
): Promise<NormalizedMediaItem> {
  // A TV metadata variant cannot supply identities for a whole-entry movie log.
  if (item.tmdbTvVariant != null) return item;
  let externalIds = { ...item.externalIds };

  const isAnime = item.type === 'ANIME';
  const isMovieTv = item.type === 'MOVIE' || item.type === 'TV';

  // A movie carrying no movie-side id at all (a Letterboxd watchlist film is
  // just a slug + title + year) → resolve Trakt/TMDB/IMDB by text search, ...
  if (
    item.type === 'MOVIE' &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.imdb == null &&
    item.title !== '' &&
    (connected.includes(Provider.Trakt) || connected.includes(Provider.Simkl))
  ) {
    const found = await cachedTraktTextSearch(queryClient, item.title, item.year);
    if (found != null) {
      externalIds = {
        ...externalIds,
        ...(found.externalIds.trakt != null ? { trakt: found.externalIds.trakt } : {}),
        ...(found.externalIds.tmdb != null ? { tmdb: found.externalIds.tmdb } : {}),
        ...(found.externalIds.imdb != null ? { imdb: found.externalIds.imdb } : {}),
      };
    }
  }
```

`src/state/queries/letterboxd.ts:267-279`:

```ts
/** Public film pages resolve cold links and cached entries on every platform. Persisted, so rows don't refetch them per cold start. */
export function letterboxdFilmQuery(slug: string | null, hasTmdb: boolean) {
  return {
    queryKey: [...letterboxdQueryKeys.film(slug ?? ''), hasTmdb],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      Effect.runPromise(
        getFilmItem(
          { fetch: letterboxdDeps().fetch, tmdb: hasTmdb ? tmdbDeps() : null },
          slug ?? '',
        ),
        { signal },
      ),
    enabled: slug != null,
    // Identity never churns; only the Letterboxd average drifts, and a day is
    // the persisted snapshot's lifetime anyway.
    staleTime: 24 * 60 * 60_000,
    retry: false,
    throwOnError: false,
  };
}
```

What `getFilmItem` returns (`src/lib/providers/letterboxd/film.ts`): a
`NormalizedMediaItem | null`. With `data-tmdb-type="movie"` it sets
`externalIds.tmdb`. With `data-tmdb-type="tv"` it sets `tmdbTvVariant` and no
`externalIds.tmdb` ("a TV match is display-only, never a movie ID"). With no
body attributes and a TMDB token, it accepts one exact title-and-year TMDB
match. It returns `null` for a 404 page and fails for other errors.

How routing treats `tmdbTvVariant` (`src/lib/providers/routing.ts`,
`providersForWrite`): "A whole-entry Letterboxd TV log has no movie identity
on other providers", so only Letterboxd stays a target.

`src/state/queries/letterboxd.ts` already imports from `./mapping`. Do **not**
add an import of `./letterboxd` to `mapping.ts`; that would be a cycle.

How the hooks in `letterboxd.ts` read the token: `useTmdbToken() !== ''`.
Outside React the same module family uses `tmdbToken()` from
`@/state/session/tmdb-token` (see its use in `src/state/queries/mapping.ts`).

### Conventions that apply

- Effect stays inside `lib/providers/`, `lib/http/` and `state/queries/*`.
  `enrich.ts` must not import `effect`; it calls a plain async accessor
  (lint rule `shinobu/effect-boundary`).
- Lookups used by the log path are named `cached*`, take the `QueryClient`
  first, and resolve `null` on any failure (see `cachedAniZipIds` in
  `mapping.ts`).
- `enrich.test.ts` fakes `@/state/queries/mapping` with `mock.module`, because
  the real module loads MMKV and the native fetch client, which do not load
  under bun. `enrich.ts` will now also import `@/state/queries/letterboxd`,
  so the test file must fake that module too
  (`docs/solutions/bun-test-mock-module-cross-file-leak.md`).
- Provider ids are `Provider.Trakt` and so on outside tests.

## Commands you will need

| Purpose       | Command                                                    | Expected on success |
| ------------- | ---------------------------------------------------------- | ------------------- |
| Install       | `bun install --frozen-lockfile`                            | exit 0              |
| Typecheck     | `bun typecheck`                                            | exit 0, no errors   |
| Lint          | `bun lint`                                                 | exit 0              |
| Focused tests | `bun test --isolate src/features/log-media/enrich.test.ts` | all pass            |
| Full tests    | `bun run test`                                             | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/state/queries/letterboxd.ts` (add one exported function)
- `src/features/log-media/enrich.ts` (add one block before the text search)
- `src/features/log-media/enrich.test.ts`
- Other `*.test.ts` files **only** to add the new export to an existing
  `mock.module('@/state/queries/letterboxd', …)` fake, if step 4 shows one
  needs it
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `getFilmItem` and `letterboxdFilmQuery`. Reuse them as they are.
- The text-search block. It stays, unchanged, as the fallback.
- `src/state/queries/media-details.ts`.
- `worker/letterboxd-proxy.ts`. The film page is already an allowed GET.

## Git workflow

- Branch: `fix/letterboxd-film-page-id`
- One commit: `fix(log): take a Letterboxd film's TMDB id from its film page`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the accessor

In `src/state/queries/letterboxd.ts`, below `letterboxdFilmQuery`, add:

```ts
/** A film's page identity for the log path: null on any failure, so the caller falls back. */
export function cachedLetterboxdFilm(queryClient: QueryClient, slug: string) {
  const { queryKey, queryFn, staleTime, retry } = letterboxdFilmQuery(slug, tmdbToken() !== '');
  return queryClient.fetchQuery({ queryKey, queryFn, staleTime, retry }).catch(() => null);
}
```

`tmdbToken` and the `QueryClient` type are already imported in this file
(`import { tmdbToken, useTmdbToken } from '@/state/session/tmdb-token';`).

**Verify**: `bun typecheck` → exit 0.

### Step 2: Ask the film page first

In `src/features/log-media/enrich.ts`, import `cachedLetterboxdFilm` from
`@/state/queries/letterboxd`. Insert this block directly **before** the
comment `// A movie carrying no movie-side id at all`:

```ts
// Letterboxd's film page states the film's exact TMDB id, and whether the
// "film" is a TV series, which has no movie identity elsewhere.
if (
  item.type === 'MOVIE' &&
  externalIds.letterboxd != null &&
  externalIds.trakt == null &&
  externalIds.tmdb == null &&
  externalIds.imdb == null &&
  connected.some((id) => id !== Provider.Letterboxd)
) {
  const film = await cachedLetterboxdFilm(queryClient, externalIds.letterboxd);
  if (film?.tmdbTvVariant != null) return { ...item, tmdbTvVariant: film.tmdbTvVariant };
  if (film?.externalIds.tmdb != null) externalIds = { ...externalIds, tmdb: film.externalIds.tmdb };
}
```

Do not change the text-search block. Its own condition
(`externalIds.tmdb == null`) now skips it when the page gave an id.

**Verify**: `bun typecheck && bun lint` → both exit 0.

### Step 3: Tests in `enrich.test.ts`

1. Near the top, next to the `mock.module('@/state/queries/mapping', …)` call
   and **before** the line `const { enrichExternalIds } = await import('./enrich');`,
   add a module-level variable and a second fake:

   ```ts
   let letterboxdFilm: Partial<NormalizedMediaItem> | null = null;

   mock.module('@/state/queries/letterboxd', () => ({
     cachedLetterboxdFilm: () => {
       calls.push('letterboxd-film');
       return Promise.resolve(letterboxdFilm);
     },
   }));
   ```

2. The existing fixture `idlessFilm()` has `externalIds: {}`. Add one
   `describe` after the block `enrichExternalIds — Simkl needs the same
bridges Trakt does`:

   ```ts
   describe('enrichExternalIds — a Letterboxd film asks its own page first', () => {
     const slugOnly = (): NormalizedMediaItem => ({
       ...idlessFilm(),
       externalIds: { letterboxd: 'hokum' },
     });

     beforeEach(() => {
       calls.length = 0;
       letterboxdFilm = null;
     });

     test('takes the page’s TMDB id and skips the text search', async () => {
       letterboxdFilm = { externalIds: { letterboxd: 'hokum', tmdb: 4242 } };
       const enriched = await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
       expect(enriched.externalIds.tmdb).toBe(4242);
       expect(calls).not.toContain('trakt-search');
     });

     test('a page that is a TV series keeps the log on Letterboxd', async () => {
       letterboxdFilm = { externalIds: { letterboxd: 'hokum' }, tmdbTvVariant: 228880 };
       const enriched = await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
       expect(enriched.tmdbTvVariant).toBe(228880);
       expect(calls).toEqual(['letterboxd-film']);
     });

     test('falls back to the text search when the page read fails', async () => {
       await enrichExternalIds(client, slugOnly(), ['simkl', 'letterboxd']);
       expect(calls.slice(0, 2)).toEqual(['letterboxd-film', 'trakt-search']);
     });
   });
   ```

   The fallback test reads only the first two calls: with Simkl connected, a
   later block of `enrichExternalIds` also runs the faked AniList title lookup
   and appends `anilist-title:Hokum`.

   Existing tests use `idlessFilm()` with no slug, so they never reach the new
   block and must pass unchanged.

**Verify**: `bun test --isolate src/features/log-media/enrich.test.ts` → all
pass, three new tests included.

### Step 4: Other suites that load `enrich.ts`

Run the full suite.

**Verify**: `bun run test` → all pass.

If a suite fails to load with an error that names
`@/state/queries/letterboxd` or `cachedLetterboxdFilm` (a missing export on a
faked module), find that suite's
`mock.module('@/state/queries/letterboxd', …)` and add
`cachedLetterboxdFilm: () => Promise.resolve(null),` to the fake's object.
Change nothing else in that suite. If a suite fails for another reason, STOP.

### Step 5: Lint and types once more

**Verify**: `bun typecheck && bun lint` → both exit 0.

## Test plan

- Three new tests in `src/features/log-media/enrich.test.ts` (step 3): the id
  branch, the TV branch, the fallback branch.
- Verification: `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0; the three tests in `a Letterboxd film asks its own page first` pass
- [ ] `grep -n "cachedLetterboxdFilm" src/features/log-media/enrich.ts src/state/queries/letterboxd.ts` shows a match in each file
- [ ] `grep -n "from './letterboxd'" src/state/queries/mapping.ts` returns no matches (no import cycle)
- [ ] `grep -n "from 'effect" src/features/log-media/enrich.ts` returns no matches
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The first block of `enrichExternalIds` or `letterboxdFilmQuery` does not
  match the excerpts.
- `tmdbToken` cannot be imported into `letterboxd.ts` without a new import
  cycle (typecheck or a test load error says so).
- A suite other than `enrich.test.ts` fails for a reason that is not a missing
  export on a faked `@/state/queries/letterboxd` module.
- `bun lint` reports `shinobu/effect-boundary` on `enrich.ts`.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This change hot reloads. No native rebuild.
- Cost: one film-page GET per slug-only film logged, and only when the page
  is not cached. The page is persisted for a day, and the details screen and
  film rows already fill the same cache entry.
- On web the page read goes through the existing Letterboxd Worker proxy
  (GET only). No new proxy rule.
- When the page read fails (network, a Cloudflare challenge), behaviour is
  what it was before this plan: the text search.
- A reviewer should check that the new block returns early only for the TV
  case, and that the returned item carries `tmdbTvVariant` so routing keeps
  the log on Letterboxd alone.
- Not done here: a film with a slug **and** an IMDb id but no TMDB id skips
  the page read. That shape does not occur for Letterboxd-origin items today.
