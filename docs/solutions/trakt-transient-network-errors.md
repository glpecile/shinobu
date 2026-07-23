# Intermittent `trakt: network error — NetworkError when attempting to fetch resource`

## Symptom

On web, `<YourShowsRow>` (and occasionally other Trakt rows) intermittently trip
their `SectionErrorBoundary` with:

```
trakt: network error — NetworkError when attempting to fetch resource.
```

It clears on its own / on refresh, then comes back minutes later. Feels random.

## Diagnosis (verified, not guessed)

- **It is not CORS.** Trakt sends `access-control-allow-origin: *` on every
  response including errors (`docs/solutions/web-cors-trakt.md`). A CORS failure
  would be *consistent*, not intermittent.
- **It is a genuine transient fetch rejection.** "NetworkError when attempting to
  fetch resource" is the browser's message when `fetch` rejects *before any HTTP
  status* — a dropped/reset connection, DNS blip, or the edge closing the socket.
  It maps to `ProviderNetworkError` via the `Effect.tryPromise` catch in
  `lib/providers/trakt/http.ts`.
- **Retries were already happening.** `query-client.ts`'s predicate classifies
  `ProviderNetworkError` as retryable (confirmed by running it through
  `Effect.runPromise`: the FiberFailure label is `(FiberFailure)
  ProviderNetworkError`, which doesn't match the never-retry regex). So the error
  only reaches the boundary when *every* attempt in the window fails.
- **Why every attempt failed together — the burst.** The home feed mounts ~7
  concurrent Trakt reads (watched-shows + the Up Next progress fan-out at
  concurrency 4 + trending movies/TV), all to `api.trakt.tv` over **one
  multiplexed HTTP/2 connection**. A single connection reset takes every in-flight
  stream with it at once. TanStack Query's **default `retryDelay` has no jitter**,
  so the failed batch retried in the same instant and re-collided — turning one
  blip into a boundary trip.

## Fix (`state/queries/query-client.ts`)

- **Equal-jitter backoff** (`retryDelay`): `backoff/2 + random·backoff/2`. Spreads
  a batch that failed together so their retries land on the reconnected pipe at
  different moments instead of re-colliding. Benefits every provider, not just
  Trakt.
- **An extra retry for the transient class only** (`retryCountFor`):
  `ProviderNetworkError` → 3 retries (4 attempts); other retryable failures keep
  2; rate-limit/auth stay at **0** (unchanged — those need a Retry-After sleep or
  a reconnect, never a replay; see the anilist-rate-limit-retry-storm note).

## What this does *not* do

It doesn't stop the connection from ever dropping — it makes the app ride out the
drop instead of surfacing it. If these errors become frequent rather than
occasional, look upstream (Trakt edge health, or trimming the mount-time burst)
rather than adding more retries.
