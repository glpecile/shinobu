# Plan 019: `useResolvedMediaItem` has characterization tests for its core branches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/queries/resolve-item.ts src/state/queries/up-next-cache.ts src/state/queries/use-diary-feed.test.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (tests only; no production code changes)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

`useResolvedMediaItem` (`src/state/queries/resolve-item.ts`) decides which item
every details and episode screen shows. It is the entry point of
`src/app/details/[provider]/[id]/index.tsx` and
`src/app/episode/[provider]/[id]/[...episode].tsx`, the most-used routes. It
combines an 11-step cache lookup order, a `mediaType` gate, six cold-link
fetch paths and a composite `isLoading`. The individual `findIn*Cache` helpers
are tested in their own modules, but nothing tests the composition, and no test
file imports `resolve-item`. A regression shows up as "Not found", a
wrong-type twin (a Trakt TV item where a movie was tapped), or a spinner that
never ends. These characterization tests pin today's behaviour before anyone
refactors the hook.

## Current state

`src/state/queries/resolve-item.ts` (abridged):

```ts
export function useResolvedMediaItem(id: string, mediaType?: MediaType): {
  item: NormalizedMediaItem | undefined;
  isLoading: boolean;
} {
  const feed = useUnifiedFeed({ includeHidden: true });
  const queryClient = useQueryClient();
  const cachedItem =
    findItemById(id, [feed.yourWatchlist, feed.trendingMovies, feed.trendingShows, feed.seasonalAnime, feed.animeMovies], mediaType) ??
    findInUpNextCache(queryClient, id) ??
    findInSearchCache(queryClient, id) ??
    findInDiaryCache(queryClient, id) ??
    findInWatchlistCache(queryClient, id) ??
    findInLetterboxdListsCache(queryClient, id) ??
    findInSerializdListsCache(queryClient, id) ??
    findInSerializdUpcomingCache(queryClient, id) ??
    findInTmdbCache(queryClient, id) ??
    findInSeasonalPagesCache(queryClient, id);
  const resolvedItem = mediaType == null || cachedItem?.type === mediaType ? cachedItem : undefined;
  const deepLink = resolvedItem == null ? parseTmdbItemId(id) : null;
  const deepLinkDetails = useMediaDetailsQuery(deepLink != null ? tmdbStub(id, deepLink) : undefined);
  ... AniList / Simkl / Trakt / IMDb / Letterboxd / Serializd cold paths ...
  return {
    item: cachedOrFetched != null && enriched != null ? mergeCatalogueMetadata(cachedOrFetched, enriched) : cachedOrFetched,
    isLoading:
      feed.isLoading ||
      (deepLink != null && deepLinkDetails.isPending) ||
      ... ,
  };
}
```

The hook-test pattern to copy is `src/state/queries/use-diary-feed.test.ts`:

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');
const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({ createMMKV: () => ({ getString: …, set: …, remove: …, getAllKeys: …, addOnValueChangedListener: () => ({ remove() {} }) }) }));
mock.module('react-native', () => ({ Platform: { OS: 'web', select: (spec) => spec.web } }));
mock.module('expo-crypto', () => ({ … }));
let providers: ProviderId[] = [];
mock.module('@/state/session', () => ({ useConnectedProviders: () => providers }));
let transport: (url: string, init?: RequestInit) => Promise<Response>;
mock.module('@/lib/http/client', () => ({ httpFetch: (url, init) => transport(String(url), init) }));
...
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
```

Read `docs/solutions/bun-mock-module-leaks-across-suites.md` and
`docs/solutions/bun-test-mock-module-cross-file-leak.md` before writing mocks.
The suite runs with `--isolate`, but follow what those docs say.

To seed the Up Next cache, read `findInUpNextCache` in
`src/state/queries/up-next-cache.ts` and `UpNextInputs` in
`src/features/up-next/types.ts`, and build the smallest `inputs` value it
scans (e.g. one `progress` entry whose `item` is your fixture) under
`[...UP_NEXT_QUERY_ROOT, 'inputs']`.

AGENTS.md "Tests": one case per branch; don't test library behaviour or pass-throughs.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                  | exit 0              |
| Typecheck | `bun typecheck`                                  | exit 0              |
| One file  | `bun test src/state/queries/resolve-item.test.ts`| all pass            |
| All tests | `bun run test`                                   | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                       | exit 0              |

## Scope

**In scope**: `src/state/queries/resolve-item.test.ts` (create).

**Out of scope**: any production file. If a test reveals a bug, record it in
the report and keep the test asserting **today's** behaviour with a
`// characterizes current behaviour: <bug>` comment. Don't fix it here.

## Git workflow

- Branch: `test/resolve-item`
- One commit: `test(details): characterize useResolvedMediaItem`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Harness

Create `resolve-item.test.ts` with the `use-diary-feed.test.ts` preamble
(happy-dom, mocks, `setup()`). Set `transport` in `beforeEach` to a function
that **records URLs** and returns a never-resolving promise
(`new Promise<Response>(() => {})`). Cache hits must not need the network, and
cold paths stay pending, so tests are deterministic. Import
`useResolvedMediaItem` with `await import('./resolve-item')` after the mocks.

If importing the module fails because another native-only module can't load
under bun, add a `mock.module` for **that module only**, following an existing
test that mocks it (`grep -rn "mock.module('<name>'" src`).

**Verify**: a placeholder test that just renders the hook with id `'nothing-1'`
passes: `bun test src/state/queries/resolve-item.test.ts`.

### Step 2: Write exactly these four cases

1. **Cache hit (Up Next)**: seed the Up Next inputs with a `TV` item `id: 'trakt-42'`.
   `renderHook(() => useResolvedMediaItem('trakt-42'))` → `item?.id === 'trakt-42'`,
   `isLoading === false`, and the recorded URLs contain no request whose
   purpose is resolving this item. Expect zero requests. If enrichment
   queries (`useTraktIdentityQuery`/`useMovieCatalogueQuery`) fire for a TV
   item, record that in a comment and assert only on `item` and `isLoading`.
2. **`mediaType` gate**: same seed, `useResolvedMediaItem('trakt-42', 'MOVIE')` →
   `item === undefined`. Also assert `isLoading`, whatever it is today. Read
   the composite `isLoading` and predict it: for `trakt-42` with `MOVIE`, the
   Trakt deep-link query is enabled, so it is probably `true`. Write the assertion to match
   the code, and add a one-line comment explaining why.
3. **Unknown id, nothing cached**: `useResolvedMediaItem('nothing-1')` →
   `item === undefined` and `isLoading === false`. This is the "Not found" state.
4. **Cold TMDB link**: `useResolvedMediaItem('<a TMDB-minted id>')`. Read
   `parseTmdbItemId` in `src/lib/providers/tmdb/normalize.ts` for the exact id
   format, and set a TMDB token if the details query is gated on one (check
   `state/session/tmdb-token.ts`). Expect `item === undefined` and
   `isLoading === true` while the transport stays pending.

Use `waitFor` only where a value changes asynchronously. Cache hits should be synchronous.

**Verify**: `bun test src/state/queries/resolve-item.test.ts` → 4 pass.
Then run it 5 times in a row (`for i in 1 2 3 4 5; do bun test src/state/queries/resolve-item.test.ts || break; done`) → all green. No flakiness.

### Step 3: Full suite

**Verify**: `bun run test` → all pass. `bun typecheck` → exit 0. `bun lint` → exit 0.

## Test plan

The four cases above: cache hit, type gate, not found, cold-link loading.
Personal-feed precedence over trending is **not** included, because it needs
the whole unified-feed query set seeded. Add it only if a cheap way to seed it
appears while you're in the file.

## Done criteria

- [ ] `src/state/queries/resolve-item.test.ts` exists with 4 passing tests
- [ ] 5 consecutive runs pass
- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] No production file changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- You need to change production code to make the hook testable (e.g. to inject a dependency).
- More than three extra `mock.module` calls beyond the preamble are needed. That
  means the import graph is too heavy for a hook test. Report which modules.
- A case is nondeterministic across the 5 runs.

## Maintenance notes

- Any change to the lookup order or the `isLoading` expression should update
  these tests in the same PR. That is their purpose.
- If someone later splits `useResolvedMediaItem` (e.g. pure `findCachedItem(queryClient, feed, id, type)`),
  move cases 1–3 to the pure function and keep case 4 as the hook test.
