# Letterboxd watched index for list progress

A Letterboxd list checks watch history with two page reads per film. The JS
cost of each settled read is fixed (`e0b6022`), but a first open of a 100-film
list still takes about 10 s of network time before its count is final.

## The two reads

- **Identity**, `/film/<slug>/` (about 270 KB): the TMDB id that matches the
  film against the Trakt, Simkl and AniList libraries, plus the runtime that
  sorting uses. It is cached for a day and shared by every list, so only a
  first open pays it. No cheaper source exists outside the Cloudflare wall
  (checked 2026-11-10): the member page has no TMDB id, the list's
  `data-details-endpoint` JSON returns the challenge, and the ld+json sits at
  the end of the page, so a `Range` read can't stop early.
- **Watch**, `/<user>/film/<slug>/`: 404 when unwatched, about 100 KB when
  watched. This is the read an index can replace.

## Approach

- One query per username reads `/<user>/films/page/N/` and keeps the set of
  `data-item-slug` values. A list film is watched when its slug is in the set.
  The query is invalidated by a Letterboxd log, the same as
  `letterboxdFilmWatchQuery`.
- Page 1 is public, but page 2 and later return 403 to a plain client
  (checked 2026-11-10, the same wall as
  `docs/solutions/letterboxd-diary-html-cloudflare-walled.md`). The pages go
  through the signed-in WebView instead. This is a new single-endpoint
  transport beside `watchlistWebFetch`, never a generic script runner.
- Without a captured web session, on web, or when the WebView read fails, list
  progress keeps the per-film watch reads.
- Undated watches: confirm in the spike that a film logged without a date is
  on `/films/`. The per-film read treats a 404 as "maybe watched" for this
  reason (`incomplete`).

## Spike first

On a device with a captured session, read pages 2 to 5 of `/films/` through
the WebView and confirm that no challenge appears and how long a 30-page
library takes. Record the result in `docs/solutions/` either way. If the
WebView is challenged too, close this plan.

JS only. Hot reloads.
