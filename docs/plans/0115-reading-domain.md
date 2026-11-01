---
status: planned
date: 2026-11-01
issue: 209
---

# 0115 — Reading: finish manga, then Hardcover books, then comics

Issue #209 asked for a feasibility spike and a scoped plan before any reading
provider is chosen. The evidence is in
`docs/brainstorms/2026-11-01-reading-providers-spike.md`. This file holds the
decisions and the units, one sub-issue of #209 each.

## Decisions

- **KTD-1. Hardcover is the book provider.** It is the only book tracker with
  a supported read and write API and an OAuth flow for public clients. It
  follows Simkl's model: a bundled public client id, PKCE, and no secret.
  Shinobu never asks for a pasted personal token; Hardcover's docs forbid
  that for apps others sign into.
- **KTD-2. Goodreads is not a provider.** It has had no API since 2020, and its
  shelf RSS is read-only and capped at 100 items. Settings and copy point
  Goodreads readers at Hardcover's Goodreads import. No scraping, and no
  proxy (AGENTS.md allows only the three existing Workers).
- **KTD-3. Units are never converted.** Manga counts chapters on an AniList
  series entry. A book counts pages on a Hardcover read. A comic issue is read
  or unread. A manga log never writes Hardcover pages and a Hardcover volume
  never writes AniList chapters.
- **KTD-4. Reading items route only to providers whose id they carry.**
  Reading has no ani.zip equivalent. Until a verified mapping exists, a book
  routes to Hardcover only with `externalIds.hardcover`, and a manga to AniList
  only with `externalIds.anilist`. `routing.ts` states the rule once, beside
  the anime rule.
- **KTD-5. New union members arrive with their provider.** `MediaType` gains
  `'BOOK'` and `ProgressUnit` gains `'page'` in B1, when Hardcover's registry
  entry needs them, not before. Comics either stay `BOOK` with a category or
  become `'COMIC'`, decided in C0 against the chosen tracker's item model.
- **KTD-6. Manga stays on AniList.** Hardcover tracks manga **volumes** as
  books. An AniList series and its Hardcover volumes are different items and
  never merge (KTD-3). Light novels keep arriving as AniList `MANGA` with
  format `NOVEL`.
- **KTD-7. Web access is probed before it is built.** Hardcover's docs say
  CORS is open; a browser-origin probe must confirm both the GraphQL endpoint
  and the token endpoint, which AniList blocks, before any web read or write.
  A failure makes Hardcover native-only on web. Metron sends no CORS headers
  in its server config, so it is expected to be native-only on web.
- **KTD-8. Rotating refresh tokens are refreshed once.** Hardcover rotates the
  refresh token on every use and revokes the whole chain on replay, which
  forces a reconnect. Refresh is single-flight, like Trakt's
  `inflightRefreshes`, and on web it also holds a cross-tab lock (Web Locks
  API) so two tabs can't spend one token. Disconnect revokes the token, since
  Hardcover lists each app's sessions.
- **KTD-9. The Hardcover budget is per top-level field.** The free plan allows
  60 a minute, burst 10, and 5,000 a day per token. One `user_books` query
  filtered on the needed statuses feeds the rail, the reading list and
  progress, as `getCurrentAnime` does for anime. Nested selections are free.

## Units

Each unit is one sub-issue of #209. M-units need no new provider and can run in
parallel; M3 owns the one new AniList read that the reading list also uses.

| Unit | Issue | Title | Depends on |
| --- | --- | --- | --- |
| M1 | #392 | Log the next chapter from details and the card sheet | — |
| M2 | #393 | Log several chapters in one write | M1 |
| M3 | #394 | Continue reading rail and manga want-to-read read-back | — |
| M4 | #395 | Diary Reading filter | — |
| B0 | #396 | Register Hardcover OAuth apps and probe browser access | owner: Hardcover account |
| B1 | #397 | Connect Hardcover as the book provider | B0 |
| B2 | #398 | Read the Hardcover library into rails, reading list and diary | B1, M3, M4 |
| B3 | #399 | Log page progress, finishes and want-to-read to Hardcover | B1 |
| B4 | #400 | Find books in search and open book details | B1 |
| C0 | #401 | Choose a comics tracker | owner answer |

### M1. Log the next chapter

`LogMediaButton` gains a manga branch: "Log chapter N" for the entry's next
chapter, and "Reread" once AniList's progress reaches a known chapter total.
Manga opens the one-shot confirm form, not the episode catch-up chain, whose
queue reads an anime airing schedule and whose copy says "episode".
`getEntryState` and the relations read report the manga's `chapters` as its
total, so logging the last chapter completes the entry. No air gate: AniList
publishes no chapter schedule. Reread uses the existing reconcile, so a
completed entry re-enters `REPEATING`.

### M2. Log several chapters in one write

AniList keeps one progress counter, so reading chapters 6 through 12 is one
`SaveMediaListEntry(progress: 12)`. The manga confirm form gets a "through
chapter" number field that defaults to the next chapter, clamps at the known
total, and never goes below the next chapter, because a lower number would
lower the counter or turn into a reread. The confirm label follows the range
("Log chapters 6–12"). An ongoing manga has no total, so the field has no
upper bound.

### M3. Continue reading rail and manga want-to-read

One AniList request,
`MediaListCollection(type: MANGA, status_in: [CURRENT, REPEATING, PLANNING])`,
cached and shared like `currentAnimeEntries`. It costs one request per refresh
window on the 30/min budget (`docs/solutions/anilist-rate-limit-retry-storm.md`).

- Home gets a Continue reading rail after the watchlist: CURRENT and
  REPEATING, newest update first, each card showing "Ch 12 / 59" or "Ch 12".
- The AniList watchlist leg adds PLANNING manga, and `hasWatchlistReadLeg`
  stops reporting AniList as unknown for manga. That closes plan 0031 OQ-4b.
- Logs and watchlist writes invalidate the new key.

### M4. Diary Reading filter

The diary format filter adds a Reading option for manga, and later books,
replacing plan 0095's "manga shows only under All". The month stats count
chapters for it.

### B0. Register Hardcover OAuth apps and probe browser access

Owner action plus probes, recorded in `docs/solutions/web-cors-hardcover.md`:

- Register Shinobu's public app(s) with only the scopes B1–B4 need:
  `read:me`, `read:library`, `write:library`, `read:catalog:search`,
  `read:journal`. Device grant stays off.
- Find out whether one public registration accepts both `shinobu://` and the
  web origin's `https` redirect, or whether web needs an SPA registration and
  native a "mobile" one, which means a platform-selected client id.
- Run a browser-origin preflight and request against
  `https://api.hardcover.app/v1/graphql` and `/oauth2/token`, and record the
  `RateLimit` headers.

### B1. Connect Hardcover

`ProviderId` gains `'hardcover'`; `MediaType` gains `'BOOK'`;
`ProgressUnit` gains `'page'`; `externalIds` gains `hardcover`. The registry
entry declares `['BOOK']`, read and write, and community score from Hardcover's
average rating. KTD-4's routing rule ships with its routing test. The connect
flow uses PKCE, checks `state` and `iss`, stores the session, refreshes per
KTD-8 and revokes on disconnect. The Settings tracker card and onboarding
offer it.

### B2. Read the Hardcover library

One `user_books` query by status (KTD-9) normalizes into
`NormalizedMediaItem` with `type: 'BOOK'`, `progressUnit: 'page'`, the current
read's `progress_pages`, and the edition's `pages` as the total. Currently
Reading joins M3's rail, Want to Read joins the watchlist gather, and reading
journal entries (started, progressed, finished) join the diary under M4's
Reading filter.

### B3. Log to Hardcover

Write adapters through the existing fan-out and per-provider results:

- Start reading sets status 2. Progress updates `progress_pages` on the open
  read, dated with `action_at`. Finish sets status 3.
- Reread sets status 2 on a Read book, which opens a new read.
- Want-to-read is the watchlist verb, status 1, never overwriting another
  status (the AniList KTD-2 rule). Removal deletes only a bare status-1 entry.
- `providerItemUrl` returns `https://hardcover.app/id/book/{id}` for
  no-dead-end links.
- The server writes journal entries itself; the adapter never does.

### B4. Find books and open book details

Search gains a Books section from `search(query_type: "book")`. The details
screen renders a `BOOK`: cover, authors, series and position, page count,
description and Hardcover rating. There is no TMDB for books, so
`getMediaDetails` returns provider data, as it does for manga. Characters come
from `book_characters` when present.

### C0. Choose a comics tracker

The owner's old comics account decides. Metron is the API-capable candidate:
a bearer token from the account page, scrobble writes and collection reads.
It is native-only on web, and scrobbling an unowned issue adds it as a digital
copy. Hardcover's comics coverage is the zero-new-provider alternative. League
of Comic Geeks has no API. C0 also settles KTD-5's comics `MediaType`.

## Out of scope

Goodreads RSS, Google Books, MyAnimeList, MangaUpdates, Kitsu and Literal
(see the spike), audiobook seconds, reading goals, personal ratings, and
AniList volume progress (`progressVolumes`) beyond display.

## Build

M1–M4 and B1–B4 are JS only and hot reload. B1's OAuth return on native uses
the existing `shinobu://` scheme, so no prebuild is expected unless B0 needs a
second scheme.
