---
status: planned
date: 2026-11-01
issue: 209
---

# 0117 — Reading: finish manga, then Hardcover books, then comics

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
  proxy (AGENTS.md allows only the four existing Workers).
- **KTD-3. A unit converts only where both sides count the same thing.**
  Manga counts chapters on an AniList series entry. A book counts pages on a
  Hardcover read. A comic issue is read or unread. A finished Hardcover volume
  is one AniList volume, so it writes `progressVolumes`. Pages and chapters are
  never estimated from each other: a page log writes no AniList chapter, and a
  chapter log writes no Hardcover page.
- **KTD-10. Reading is one category.** Manga, light novels, books and comics
  are all "reading" wherever the user picks or sees a grouping: one filter
  option, one rail (Continue Reading), one reading list. The UI never offers
  separate Manga, Books or Comics choices. The grouping is only what the user
  sees; it changes no unit (KTD-3). Numbered last so the decisions below keep
  their numbers.
- **KTD-4. A reading item routes to every connected provider that has the
  work.** This is the rule for every other type, and reading follows it. A
  provider has the work when the item carries that provider's id. An item
  arrives with its own provider's id, and the reading bridge (B5) finds the
  other one, as ani.zip does for anime. `routing.ts` states the rule once,
  beside the anime rule. Revised 2026-11-13: the first version routed a book
  to Hardcover only, which left a light novel on one of the reader's two lists.
- **KTD-5. New union members arrive with their provider.** `MediaType` gains
  `'BOOK'` and `ProgressUnit` gains `'page'` in B1, when Hardcover's registry
  entry needs them, not before. Comics either stay `BOOK` with a category or
  become `'COMIC'`, decided in C0 against the chosen tracker's item model.
- **KTD-6. A Hardcover volume and its AniList series are one work.**
  Hardcover tracks a manga or light novel as one book per volume. AniList
  tracks it as one series entry with a chapter count and a volume count. A
  matched book is volume N of that entry. Its log writes both providers, in
  the unit KTD-3 allows, and feeds show the work once (B6). Light novels still
  arrive from AniList as `MANGA` with format `NOVEL`.
- **KTD-7. Web access is probed before it is built.** Hardcover passed on
  2026-11-12: the GraphQL, token and revoke endpoints all answer a browser
  origin (`docs/solutions/web-cors-hardcover.md`), so web connects, reads and
  writes like native. The token and revoke endpoints expose no headers, so a
  refresh on web can't read `Retry-After`. Metron sends no CORS headers in its
  server config, so it is expected to be native-only on web.
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
| M4 | #395 | Diary Reading filter (optional) | — |
| B0 | #396 | Register Hardcover OAuth apps and probe browser access | owner: Hardcover account |
| B1 | #397 | Connect Hardcover as the book provider | B0 |
| B2 | #398 | Read the Hardcover library into rails, reading list and diary | B1, M3 (M4 if it ships) |
| B3 | #399 | Log page progress, finishes and want-to-read to Hardcover | B1 |
| B4 | #400 | Find books in search and open book details | B1 |
| B5 | — | Bridge Hardcover volumes to AniList entries | B3, M1 |
| B6 | — | Show a bridged work once | B5, B2, M3 |
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

### M4. Diary Reading filter (optional)

The diary format filter adds a Reading option for manga, and later books,
replacing plan 0095's "manga shows only under All". The month stats count
chapters for it.

Optional: it can land in either phase or stay undone. The owner preferred a
search filter first, which shipped as plan 0119's Reading search scope.
Search exposes Reading in its FAB scope picker; the diary keeps its own
format options if M4 ships.

### B0. Register Hardcover OAuth apps and probe browser access

Owner action plus probes, recorded in `docs/solutions/web-cors-hardcover.md`.
The unauthenticated probes are done; the rest needs the registered app.

- Register Shinobu's public app(s) with only the scopes B1–B4 need:
  `read:me:content`, `read:library`, `write:library`, `read:catalog:search`,
  `read:journal`. `read:me` would also grant the member's email. Device grant
  stays off.
- Register no loopback redirect on the production app. Anyone holding the
  public client id could catch a code on localhost in Shinobu's name, the same
  risk as the device grant. Local web dev uses a separate dev registration
  through `EXPO_PUBLIC_HARDCOVER_CLIENT_ID`.
- Done: one "Mobile, desktop, or CLI" registration holds both
  `shinobu://redirect` and `https://shinobu.glpecile.xyz/?oauth=hardcover`,
  so native and web share one client id.
- With the client id, run one real connect and record whether the token
  response has a `refresh_token` without the `offline_access` scope, the
  redirect's `iss`, and the live `RateLimit` values.

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
journal entries (started, progressed, finished) join the diary, under M4's
Reading filter if it has shipped and under All otherwise.

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

Search's Reading scope gains a Books section from
`search(query_type: "book")` (plan 0119 KTD-3), not a new scope. Movies & TV
gains it too. The details
screen renders a `BOOK`: cover, authors, series and position, page count,
description and Hardcover rating. There is no TMDB for books, so
`getMediaDetails` returns provider data, as it does for manga. Characters come
from `book_characters` when present.

### B5. Bridge Hardcover volumes to AniList entries

Nothing publishes a Hardcover-to-AniList mapping, so the bridge matches at log
time and caches the answer, in `enrichExternalIds` beside the ani.zip lookup.
"NISEMONOGATARI, Part 1: Fake Tale (Light Novel)" is the test case: AniList
has it as the novel "Nisemonogatari", 35 chapters in 2 volumes.

- **Match.** Take the book title without its volume marker, subtitle and
  format tag ("Nisemonogatari"), and the Hardcover series name. Search AniList
  `MANGA` for each. A result matches only when one of its titles or synonyms
  equals the candidate, and one of its staff is a Hardcover author. Both
  compares fold case, punctuation, name order and long-vowel spelling
  ("Eiichiro", "Eiichirou"). Anything less is no match, because a wrong match
  writes to the wrong entry on a real list.
- **Volume.** N is the number in the title's marker ("Part 1", "Vol. 3",
  "Volume 3"), else the series position when the series name made the match,
  else 1 when AniList lists one volume.
- A matched book with a volume number carries `externalIds.anilist` and routes
  to AniList. AniList starts selected in "Write to", and the reader can clear
  it.
- **Finish** writes `progressVolumes` as the higher of N and the entry's
  count. When N is AniList's last volume the entry completes, as the last
  chapter does in M1. A reread of the last volume follows M1's reread.
- **Start and page logs** make the AniList entry Reading and write no number
  (KTD-3). Want-to-read writes Planning under the AniList KTD-2 rule.
- **The form starts from what AniList knows.** When the entry's volume count
  has reached N, the form opens on "Finished the book". Otherwise it opens on
  the Hardcover page and shows the AniList progress as a note ("AniList:
  chapter 12 of 35"). It never turns chapters into a page (KTD-3).
- A matched book with no volume number gets AniList as a manual row that opens
  the entry. A book with no match gets no AniList row: most books are not on
  AniList.
- A chapter log from an AniList entry stays on AniList. No source says which
  volume holds a chapter.

Probed on 2026-11-13: `SaveMediaListEntry` takes `progressVolumes`, and one
`Page.media(search:, type: MANGA)` request returns titles, synonyms, `volumes`
and staff for one point of AniList's 30 a minute. Still to check before
building: which volume markers the titles in the owner's Hardcover library
use.

### B6. Show a bridged work once

Continue Reading, the reading list and the diary show one card for a bridged
work. The open Hardcover volume is the card, because it holds the finer
progress ("p. 120 / 306"), and it carries the AniList id. The AniList entry
shows alone when none of its volumes is in the Hardcover library. The match
runs against the reader's own AniList list, which M3 already loads, so it
costs no request.

### C0. Choose a comics tracker

The owner's old comics account decides. Metron is the API-capable candidate:
a bearer token from the account page, scrobble writes and collection reads.
It is native-only on web, and scrobbling an unowned issue adds it as a digital
copy. Hardcover's comics coverage is the zero-new-provider alternative. League
of Comic Geeks has no API. C0 also settles KTD-5's comics `MediaType`.
Whichever tracker wins, its search joins search's Reading scope as a section
(plan 0119 KTD-3), never a Comics scope (KTD-10).

## Out of scope

Goodreads RSS, Google Books, MyAnimeList, MangaUpdates, Kitsu and Literal
(see the spike), audiobook seconds, reading goals and personal ratings.

## Build

M1–M4 and B1–B6 are JS only and hot reload. B1's OAuth return on native uses
the existing `shinobu://` scheme, so no prebuild is expected unless B0 needs a
second scheme.
