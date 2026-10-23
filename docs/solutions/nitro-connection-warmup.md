# Warming provider connections ahead of the Up Next waterfall

## Symptom

Up Next is the heaviest home query: `fetchUpNextInputs` does a Trakt watched-shows
read, then fans out up to 20 per-show `progress/watched` reads (4 at a time) plus
an AniList list read. Cold, every one of those is the *first* request to its host,
so it pays a full TCP + TLS (+ HTTP/2) handshake before any bytes move. The section
resolves last and slowest, which is what made its skeleton→content growth so
visible (see the skeleton-mirror note below).

## Fix — `react-native-nitro-fetch` prefetch (native only)

nitro-fetch pools connections per host (Cronet on Android, URLSession on iOS), so a
single throwaway request opens a pipe the real reads reuse. `lib/http/warm-connections.ts`
warms each connected provider's host root (+ TMDB, which every detail screen hits)
using two mechanisms:

- **`prefetch(url, { headers: { prefetchKey } })`** — warms the pool *this* session, fired from the feed screen's
  mount effect, a beat before TanStack fires the real queries.
- **`prefetchOnAppStart(url, { prefetchKey })`** — registers a *persistent* native
  prewarm that runs at process start on the next launch, before JS boots, so a
  returning user's first Up Next load can reuse the connection.

Both are best-effort (`.catch(() => {})`) and hit host roots with no auth — a
4xx/redirect back is fine, the connection is warmed regardless and provider reads
ignore the cached root response. The module self-guards to run once per session. The web sibling
(`warm-connections.web.ts`) is a no-op: browsers own their own connection pool and
there is no nitro-fetch on web.

Scope is deliberately narrow — only the hosts the home waterfall races against
(Trakt, AniList, Simkl) plus TMDB. Letterboxd/Serializd warm on their own read paths; this
is not a general "prewarm everything" hook.

## Nitro Fetch 1.8 request validation

`prefetch` requires a `prefetchKey` header before it calls the native transport.
The earlier `prefetch(url)` call rejected on every invocation, and the best-effort
catch hid the failure. Both warmup paths now supply the same key. The regression
test runs Nitro Fetch's real JavaScript validation with only its native JSI
boundary replaced, and checks that the warmup reaches that boundary.

These keys warm connections only. Provider reads do not supply them and do not
consume the cached root response. Android's startup replay is configured by the
Nitro Fetch Expo plugin in `app.json`; generated native files need no edits.

## What it does *not* fix

The waterfall's *depth* (20 progress reads in 5 sequential waves) is inherent to
Trakt having no bulk-progress endpoint — warmup only removes the per-host handshake
from the first request to each host, not the round-trips. The perceived-jank fix is
the skeleton mirroring the resolved height (`components/feed-skeleton.tsx`
`UpNextSectionSkeleton`), which removes the ~300px reflow on *all* platforms; the
connection warmup is a native cold-start latency shave on top of it.
