# Letterboxd watchlist → release dates: what the resolve actually costs

**Context (2026-07-27, plan 0030 U6 / KTD-5).** Calendar wants unreleased films
from the Letterboxd watchlist. Every other release source arrives pre-dated —
Trakt's `/calendars/my/*` already know when a watchlisted film comes out. The
Letterboxd watchlist is a *scrape* (`lib/providers/letterboxd/watchlist.ts`)
yielding `{ slug, title, year }`: no dates, no TMDB id. So each candidate costs
two requests — a TMDB `searchMovie` to learn its id, then `getMediaCatalogue`
whose `release_dates` append carries `releaseCalendar`.

U6 shipped with a measurement gate: measure before building a fan.

## The measurement

Seven real public watchlists, scraped in full with the app's own
`parseWatchlistPage`, then filtered exactly as `selectReleaseCandidates` does
(`year == null || year >= 2026`):

| watchlist | films | candidates, whole list | candidates, page 1 |
| --- | ---: | ---: | ---: |
| A (new-release heavy) | 601 | **43** | 22 |
| B | 840 | 9 | 8 |
| C | 558 | 15 | 3 |
| D | 840 | 1 | 1 |
| E | 63 | 0 | 0 |
| F | 58 | 0 | 0 |
| G | 6 | 0 | 0 |

Median candidates: 1. Only the most new-release-focused account exceeded the
30-film resolve cap, and only from the *whole* list.

## Two findings, one of them the plan didn't budget for

1. **The year filter works.** It turns 600–840 films into 0–43 candidates — a
   93–99% cut, before a single request. The 30-cap is therefore slack in
   practice rather than load-bearing; it stands as the guard that stops a wider
   future source turning into an unbounded fan.

2. **Reading the whole watchlist is itself the fan.** KTD-5 costed the *resolve*
   (2 calls/film) but not the scrape. Letterboxd pages the watchlist 28 films at
   a time, so watchlist A is 22 sequential HTML fetches at ~120 KB each — ~2.6 MB
   per gather — to find a median of one candidate. That is squarely the
   "hidden fan" the stop condition names, and it lands on mobile data.

## What shipped

**Page 1 only** (`fetchLetterboxdReleaseInputs` calls `getWatchlist`, not the
paged query), for three reasons:

- It shares its cache entry with the Letterboxd watchlist feed row, so on the home
  screen — where Up Next lives — the scrape has usually already happened and the
  source costs **zero** extra page fetches.
- Letterboxd orders a watchlist most-recently-added first (verified: watchlist A
  leads with 2025/2026 titles). Page 1 is where films a user just put on their
  radar sit, which is the population that can plausibly release inside a 7-day
  window.
- 28 films in means at most 28 candidates out, so the cap can never bind and the
  worst case is 56 forever/15-min-cached TMDB calls.

**Recall this costs:** candidates outside page 1 are invisible (watchlist A: 22
of 43; watchlist C: 3 of 15). A user who adds films faster than ~28 between
gathers can push a near-release film off page 1. The mitigation if that ever
bites is a bounded *few* pages, not the whole list.

## The matching hazard is the real risk, not the cost

`title + year → TMDB id` is the same fuzzy resolve that once rendered Kubrick's
*2001: A Space Odyssey* for Nolan's *The Odyssey*
(`trakt-text-search-wrong-movie-match.md`). On the details screen a wrong match
degrades metadata; here it would put a **different film on the user's calendar
with an unrelated date**. So the resolve goes through `cachedTmdbMovieIdByTitle`
→ `pickMovieMatch` unchanged: exact-year tier first, a ±1 window only when
exactly one candidate sits in it, otherwise `null`. A dropped candidate is a
missing row; a guessed one is a lie. Never relax this leg to "take the top hit"
to improve coverage.
