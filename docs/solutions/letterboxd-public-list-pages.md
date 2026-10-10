# Letterboxd public list pages

## Spike (2026-10-06)

Unauthenticated Bun fetches, both default and fixed browser User-Agent:

| Path | Result |
| --- | --- |
| `/jack/lists/`, `/dave/lists/`, `/glptest/lists/` | 200, list-summary articles |
| `/jack/likes/lists/`, `/dave/likes/lists/` | 403, Cloudflare challenge |
| `/jack/likes/lists/page/1/`, `/glptest/likes/lists/page/1/` | 200, list-summary articles |
| `/jack/likes/lists/page/2/` | 200, next page |
| `/jack/lists/page/2/` | 403, Cloudflare challenge |
| `/jack/list/50-classics-to-rewatch-in-2026/` | 200, film grid |
| `/jack/list/50-classics-to-rewatch-in-2026/page/2/` | 200, empty film grid |

Use the explicit page-1 URL for liked lists. Deeper created-list pages may
still be challenged: retain the loaded pages and provide retry plus the
Letterboxd link, rather than treating a failed page as an empty/end page.
Native iOS reads later loaded 12 summaries from page 2 of both created and
liked indices. Challenge behavior varies by transport and request.

The index's `article.list-summary` contains an owner-specific list link,
title, film count and LazyPoster previews. List films use the same LazyPoster
attributes as watchlists. Parse only `ul.poster-list`, excluding unrelated
sidebar/favorite posters. Pagination's `a.next` is the end signal; do not
assume the watchlist's 28-film page size applies to lists.

Web uses the existing same-origin Letterboxd Worker exception, still public
GET-only and without forwarding any session, cookies or client headers.

During iOS validation, some constructed Letterboxd poster CDN URLs returned
403 (including `51632-21-grams-0-600-0-900-crop.jpg`), while others rendered.
This also affects the existing watchlist/film-detail poster path; list HTML
and TMDB detail metadata still load. Don't proxy artwork or widen the public
GET allowlist to work around an image CDN challenge. Exact public film-page
poster recovery is documented in `letterboxd-constructed-poster-403.md`;
these 403s are not sufficient evidence of a client-wide CDN challenge.
