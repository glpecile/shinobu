# Letterboxd TMDB redirect and persisted film reads

**Context (2026-10-27, issue #320).** Every Letterboxd film row could cost a full
film page just to learn its slug, then another for identity, and repeat both on
every cold start.

## The redirect

`GET https://letterboxd.com/tmdb/27205/` answers `302`, `content-length: 0`,
`location: /film/inception/`. The `Location` is **relative**.

- **Native:** `redirect: 'manual'` makes nitro-fetch send `followRedirects: false`.
  iOS (`willPerformHTTPRedirection` → `nil`) and Android (Cronet
  `onRedirectReceived` → cancel) both hand back the 3xx with its headers and an
  empty body, so `resolveFilmSlug` reads the slug from `Location` and no film page
  is downloaded.
- **Web:** the Worker proxy's upstream `fetch` follows the redirect server-side
  and answers `200` under the proxy URL. A browser's own manual redirect is
  opaque, so a 302 never reaches the client. Web still reads the page's `og:url`.

## Persistence

`['letterboxd', 'slug', tmdbId]`, `['letterboxd', 'film', slug, hasTmdb]` and
`['letterboxd', 'film-watch', …]` are on the `persist.ts` allowlist. The watched
check reads the slug through the shared slug query instead of resolving it
inline, so ratings and watched eyes share one request per film. All three hold
small normalized values (a slug, a `NormalizedMediaItem`, or null), not HTML. A
cached null watch still means unknown, never unwatched
(`letterboxd-unknown-watches-and-list-likes.md`).

## Invalidating watched aliases (2026-11-01)

A successful log can carry only a Letterboxd slug while a mounted row reads
its watch through a TMDB-only key. Matching only ids on the logged item left
that alias fresh for an hour. `invalidateAfterLog` also compares each cached
watch key's TMDB id through the shared slug lookup, so slug-only and TMDB-only
logs invalidate both aliases without refetching unrelated films. The existing
invalidation test exercises both directions against a real QueryClient.
