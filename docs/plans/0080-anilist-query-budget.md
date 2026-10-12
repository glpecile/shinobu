# AniList query budget and Otraku patterns

Date: 2026-10-12. Workload: four distinct anime detail opens and two
load-more scrolls from Winter 2027 TV (manual baseline in
`docs/solutions/anilist-rate-limit-retry-storm.md`).

## Evidence

- [AniList media-list guide](https://docs.anilist.co/guide/graphql/queries/media-list):
  authenticated `Media.mediaListEntry` belongs in a media read; signed-out null
  is not proof that a connected user's entry is absent.
- [Pagination guide](https://docs.anilist.co/guide/graphql/pagination): use
  `pageInfo.hasNextPage`, not inaccurate totals or guesses from item count.
- [Rate-limit guide](https://docs.anilist.co/guide/rate-limiting): currently
  30/min, also burst-limited; a 429 has a cooldown and may expose its reset time.
- [Otraku queries](https://github.com/lotusprey/otraku/blob/928c7af5eb02e850ca4da912609e22db02eb6017/lib/util/graphql.dart)
  and [media providers](https://github.com/lotusprey/otraku/blob/928c7af5eb02e850ca4da912609e22db02eb6017/lib/feature/media/media_provider.dart):
  select lean cards, group media info with entry state, and group related
  connections with conditional fields. Otraku itself does not fetch every
  section in one request.
- Live public API probe: `Media(id:21).airingSchedule(perPage:100)` returned
  `perPage:25`, 25 nodes, and `hasNextPage:true`. Our page-one-only read truncates
  episode air dates on longer shows.

## Implementation

1. One shared AniList detail operation supplies full metadata, episodes,
   relations/tags/recommendations, and authenticated entry state. Keep direct
   entry reads for writes and destructive guards. Keep TMDB-first credits and
   the existing AniList credit fallback; do not eagerly fetch unused credits.
2. Use separate card/detail field selections. Never cache a partial card as
   a complete detail record. Resolve full detail metadata through the shared
   query while the cached card supplies the initial title and poster.
3. Carry seasonal `hasNextPage` through Home and the explorer so page-one
   reuse remains free. Continue an airing schedule only while the API says
   another page exists, requesting 25 rows per page.
4. Share a cooldown across AniList requests. Respect Retry-After and
   X-RateLimit-Reset; do not replay a missing-header 429 after one second.
5. Scope personal combined results to the current session without putting
   tokens in query keys. Invalidate the combined read after logs/watchlist
   writes; preserve public browsing on auth failure and abort handling.

## Validation

Extend existing provider/query tests for shared authenticated reads, session
changes, mutation invalidation, exact-boundary pagination, multi-page airing,
and cooldown suppression. Validate the actual composed GraphQL operation
against AniList, not only a mock. Report HTTP attempts separately from payload
size and from the owner's manual workload; do not invent a measured budget.
No new client dependency, transport batcher, dev screen, social features, or
provider-write behavior change.
