# Provider retry, cancellation, and decode boundaries

## Retry-After

Trakt and TMDB truncated long server cooldowns to five seconds and retried.
A fake TMDB response with `Retry-After: 60` produced two requests in about
five seconds. Both now follow AniList's policy: retry once only when the full
cooldown fits the five-second UI budget; otherwise return the original
`ProviderRateLimitError`. TanStack Query must not retry that error again.

## Cancellation

An interrupted Effect fiber does not automatically stop a Promise's network
request. Read queries pass their TanStack Query signal to
`Effect.runPromise(effect, { signal })`. Each provider's `Effect.tryPromise`
fetch callback passes its own signal to the transport.

The installed `react-native-nitro-fetch` supports this signal and calls its
native client's `cancelRequest`. Browser fetch supports it too. The regression
test cancels a real QueryClient query and observes an abort at the fake
transport, rather than only checking the fiber's exit.

Nested `fetchQuery` reads retain their own signals. Their cache entries can
serve other consumers, so cancelling a parent must not cancel shared child
queries. Once a child finishes, the cancelled parent's signal prevents its
next Effect request from starting. The coalesced Trakt refresh also retains
its independent fiber: cancelling one waiter must not cancel a rotating-token
grant needed by another waiter.

Graceful mapping fallbacks must rethrow cancellation rather than cache it as
an identity miss. Writes have no automatic query-unmount cancellation, and
the Letterboxd WebView write bridge is unchanged. Plain ani.zip mapping reads
are not Effect requests and retain their existing behavior.

## Response shapes

`response.json() as Promise<A>` only parses JSON. A Trakt search returning `{}`
reached `.map` and produced an Effect defect, bypassing typed-error recovery.
Both search endpoints now decode their common response with Effect 3 Schema
before normalization. Required movie/show records are checked; unsupported
result types still drop out, and nullable optional metadata stays optional.

AniList's GraphQL envelope also decodes before code accesses its `errors`
array. Invalid successful responses become `ProviderDecodeError`. Non-JSON
HTTP failures preserve the HTTP status as `ProviderNetworkError`, rather than
claiming that an HTML service error is a successful response with bad JSON.
An explicit API-disabled body is not a rate limit, even when HTTP says 429.
See `anilist-api-outage-403.md` for the existing refusal and Referer history.

These checks cover the reproduced search defect and GraphQL envelope. Other
endpoint DTOs still use their existing decoding and normalization; this is
not a complete schema migration.
