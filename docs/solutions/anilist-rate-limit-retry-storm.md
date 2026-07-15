# AniList 429s from ordinary browsing: staleTime 0 + default retries = rate-limit storm

## Symptom

Intermittent "An error has occurred" console errors caught by
`SectionErrorBoundary` on anime detail screens (`AnimeSeasonAccordionList`
et al.) — sections vanish, then work again minutes later. Feels random;
looks like AniList rate limiting. It is.

## Root cause (measured, not guessed)

AniList's budget is **30 req/min** (degraded mode; see
docs/solutions/web-cors-anilist.md). Three compounding defaults:

1. **`new QueryClient()` with default `staleTime: 0`.** Every screen mount
   refetches every observed query — and `useUnifiedFeed` is mounted on *both*
   the home and details screens. Measured with a request counter on web:
   **~4 AniList requests per home→details→back cycle with AniList
   disconnected** (seasonal row refetched on each navigation + episodes +
   credits), ~8–9 with it connected (entry state + viewer + watching list).
   A minute of normal browsing exhausts the budget.
2. **Viewer-id prefix request.** `fetchCurrentAnime` chained
   `getViewerId` before every watching-list read — 2 requests per refresh for
   a value that never changes within a session.
3. **Retry amplification.** On a 429, `lib/providers/anilist/http.ts` already
   sleeps (≤5 s) and retries once. TanStack Query's default `retry: 3` then
   retried the *whole* query — up to 8 HTTP calls per failing query, spending
   the recovering budget on doomed retries and extending the outage.

## Fix

- `state/queries/query-client.ts`: app-wide defaults — `staleTime: 60_000`
  floor, and a `retry` predicate that never retries
  `ProviderRateLimitError`/`ProviderAuthError` (detected via the FiberFailure
  `name`, which carries the Effect tagged-error tag: rejections from
  `Effect.runPromise` are `FiberFailure`s with `name: "(FiberFailure)
  ProviderRateLimitError"`, `message: "An error has occurred"` — which is
  exactly the string the redbox showed).
- Catalogue rows (trending/seasonal) get `staleTime: 15 min`; episodes 5 min;
  credits 1 h. User state (entry state, watching list) keeps the 60 s floor —
  writes invalidate those keys explicitly, and invalidation refetches
  regardless of staleTime.
- Viewer id cached forever under `anilistQueryKeys.viewer()`;
  `useDisconnectProvider` now purges `removeQueries({ queryKey: [providerId] })`
  so reconnecting a different account can't read the previous account's
  viewer id or lists (every provider's query-key root is its provider id).

## Result

Same browse session re-measured: first cycle 3 requests (episodes + credits +
one seasonal fetch), subsequent cycles **0** until a staleTime expires.

## Rule of thumb

Any new provider read that isn't user-mutable state should declare a
staleTime matched to how fast the data actually changes — the default floor
only protects navigation churn, not polling-style waste.
