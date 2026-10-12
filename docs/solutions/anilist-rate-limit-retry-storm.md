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

## Episode navigation follow-up, 2026-09-27

Adding AniList watched state to episode details added an observer of the
existing entry-state key, not a separate per-episode GraphQL query. However,
the 60-second stale window allowed episode navigation to refetch progress
every minute. Entry state now stays fresh for five minutes. Successful logs
and watchlist writes already invalidate its exact key, and manual refresh
still refetches it. Edits made outside Shinobu can remain cached for five
minutes.

The provider's retry also truncated a long `Retry-After` to five seconds.
A regression using `Retry-After: 30` observed two requests five seconds apart.
It now fails with the original rate-limit error when the advertised wait
exceeds the five-second budget. Short waits retain the one retry; TanStack
Query still never retries rate-limit errors. This avoids a premature replay
without delaying a user action through a long cooldown.

The reported `CreditsSections` stack identifies the consumer that encountered
the limit, not the requests that exhausted it. No live request trace was
available for this report; these changes address the verified cache policy
and retry behavior, not a measured attribution of the entire request budget.

## Seasonal explorer browsing follow-up, 2026-10-12

Opening distinct titles still spent separate requests on episodes and
relations/recommendations/tags. A stale time only helps revisits, not four or
five different anime. Both query hooks now join the same relations query,
whose GraphQL response includes the episode fields for anime (not manga).
It primes the existing episode cache and keeps the five-minute airing-data
freshness window. The episode-only provider read remains available to write
and reconciliation paths.

The query regression mounts both sections together: **one request**, then
**zero additional requests** when remounted with the same QueryClient.
Credits and authenticated entry state remain separate reads, so this is one
fewer request per uncached anime, not a claim that the whole screen costs one.

The detail/episode resolver's feed observers are now cache-only. Resolving a
poster from the seasonal wall no longer starts or refreshes unrelated Home
catalogues. Cold links fetch their own record by ID; explicit refresh still
works. This also prevents errored Home rows from being retried every time a
different title opens.

### Live regression found during validation

The combined request above used a type-less inline fragment with `@skip`.
A Chromium trace from Winter 2027 → MASHLE observed the combined request
returning HTTP 500 with `{"error":{"status":500,"messages":["Bad request"]}}`,
while the seasonal catalogue and other detail requests succeeded. The failed
query was sent repeatedly. The mock-backed query test proved cache sharing,
but did not prove that AniList accepted the GraphQL operation. Live provider
validation is required before claiming a request-budget fix works.

The fragment is now replaced by directly interpolated episode fields for
anime, and no episode fields for manga. The corrected combined operation
returned HTTP 200 in the live Winter 2027 → MASHLE trace.

There was also a nested retry budget: the episode query called `fetchQuery`
for relations, and both queries retried. A simulated 503 through the real
hooks reproduced **16 requests** for one failed read. Episode observers now
leave retries to the relations query: the same regression makes **4 requests**
(one attempt plus three transient-error retries). AniList's explicit HTTP
500 `Bad request` envelope is marked non-retryable, preserving its real
status and diagnostic message instead of presenting a generic network error.

The live trace also found a separate `getAnimeById` request from Discussion.
AniList-origin records already contain the titles and aliases it supplies,
so that section now uses its existing item rather than fetching it again.

Scope of live proof: the corrected combined operation succeeded, and the
Related section appeared. A full five-title replay was not completed: the
graphical Chromium target disappeared during replay, and a fresh headless
profile's provider calls failed with `net::ERR_FAILED`. Those runs are not
counted as passes; signed-in browsing still needs a live follow-up.
