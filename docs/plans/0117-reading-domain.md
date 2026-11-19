---
status: done
date: 2026-11-01
issue: 209
---

# 0117 — Reading: finish manga, then Hardcover books

Issue #209 asked for a feasibility spike and a scoped plan before any reading
provider is chosen. The evidence is in
`docs/brainstorms/2026-11-01-reading-providers-spike.md`. This file holds the
decisions and the units, one sub-issue of #209 each.

## Shipped

Every unit shipped by 2026-11-19, and #209 closed.

| Unit | Issue | PR |
| --- | --- | --- |
| M1. Log the next chapter | #392 | #402 |
| M2. Log several chapters in one write | #393 | #408 |
| M3. Continue reading rail and manga want-to-read | #394 | #403 |
| M4. Diary Reading filter | #395 | #473, fixes in #475 |
| B0. Register Hardcover OAuth apps | #396 | #444 |
| B1. Connect Hardcover | #397 | #445 |
| B2. Read the Hardcover library | #398 | #448 |
| B3. Log to Hardcover | #399 | #446 |
| B4. Find books and open book details | #400 | #447 |
| B5. Bridge Hardcover volumes to AniList entries | #470 | #474, fixes in #475 |
| B6. Show a bridged work once | #471 | #476 |
| C0. Choose a comics tracker | #401 | dropped |

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
  Hardcover read. A finished Hardcover volume
  is one AniList volume, so it writes `progressVolumes`. Pages and chapters are
  never estimated from each other: a page log writes no AniList chapter, and a
  chapter log writes no Hardcover page.
- **KTD-10. Reading is one category.** Manga, light novels and books are
  all "reading" wherever the user picks or sees a grouping: one filter
  option, one rail (Continue Reading), one reading list. The UI never offers
  separate Manga or Books choices. The grouping is only what the user
  sees; it changes no unit (KTD-3). Numbered last so the decisions below keep
  their numbers.
- **KTD-4. A reading item routes to every connected provider that has the
  work.** This is the rule for every other type, and reading follows it. A
  provider has the work when the item carries that provider's id. An item
  arrives with its own provider's id, and the reading bridge (B5) finds the
  other one, as ani.zip does for anime. `routing.ts` states the rule once,
  beside the anime rule. Revised 2026-11-13: the first version routed a book
  to Hardcover only, which left a light novel on one of the reader's two lists.
  The revision took effect with B5 (#470).
- **KTD-5. New union members arrive with their provider.** `MediaType` gains
  `'BOOK'` and `ProgressUnit` gains `'page'` in B1, when Hardcover's registry
  entry needs them, not before.
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
  refresh on web can't read `Retry-After`.
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
| B2 | #398 | Read the Hardcover library into rails, reading list and diary | B1, M3 (M4 if it ships) |
| B3 | #399 | Log page progress, finishes and want-to-read to Hardcover | B1 |
| B4 | #400 | Find books in search and open book details | B1 |
| B5 | #470 | Bridge Hardcover volumes to AniList entries | B3, M1 |
| B6 | #471 | Show a bridged work once | B5, B2, M3 |
| C0 | #401 | Choose a comics tracker (dropped) | — |

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

The diary format filter adds a Reading option for manga and books, replacing
plan 0095's "manga shows only under All". It narrows the rows, the calendar
shading and the month stats. The diary has its own option list
(`DIARY_FORMAT_OPTIONS` in `features/diary/merge.ts`); the filmography keeps
All, Movies, TV, since a filmography rarely holds a reading credit.

- **Control.** iOS and Android use the anchored `NativePickerMenu`, as the
  filmography Role menu does. Checked 2026-11-18 at the largest text size
  (iOS AX5 on a 402 pt iPhone 17 Pro, Android font scale 2.0 at 360 dp): the
  title alone takes two thirds of the row, so even three segments overflowed,
  and four can't fit. The header wraps on native, so the pill drops under the
  title when it can't sit beside it. Web keeps the segmented control with
  four segments, which shrinks to fit a narrow window.
- **Stats.** Under Reading, the month's "logged" count splits in two:
  chapters (AniList manga) and books (Hardcover journal entries, each book
  once a month). They are never added (KTD-3). Each stat shows while a
  tracker that counts it is connected, not when data arrives, so the row
  keeps its frame as older pages load. Books count as books, not pages:
  a journal entry carries no page delta. The calendar shading still weighs a
  day by its summed units, since a shade is no count.
- Reading is offered only while a tracker that reads manga or books (AniList
  or Hardcover) is connected.
- The empty state uses the book icon: "No reading logged yet", or "No
  reading in loaded history" while older pages remain.

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
journal entries (started, progressed, finished) join the diary, under All
and M4's Reading filter.

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
and staff for one point of AniList's 30 a minute.

Built (#470). The owner's Hardcover test account held no books, so the marker
check read Hardcover's catalogue instead: 167 titles across 12 manga and
light-novel series, searched on 2026-11-18. Markers seen: ", Vol. N" (with or
without a subtitle after it, sometimes without the comma), ", Part N" before
or after the subtitle, the tags "(Light Novel)" and "(Manga)", and omnibus
titles such as "Berserk Deluxe Edition Volume 1". The matcher
(`lib/providers/reading-bridge.ts`) adds rules the probe and review forced:

- The format tag picks the AniList format: "(Light Novel)" matches only
  `NOVEL`, "(Manga)" never matches `NOVEL`. "Mushoku Tensei: Jobless
  Reincarnation" names a manga and a novel entry with the same titles and
  author.
- Two entries that both match are no match.
- An edition or omnibus gets no volume number, and neither does volume 0 or
  a number past the entry's known volume count.
- "Vol. N" wins over "Part N" ("Part 3: Stardust Crusaders, Vol. 1"), and
  only ", Part N" numbers a book: "Adventure Part 3: …" names an arc.
- A match by series name alone gets no volume number: a spin-off or a
  franchise numbers its own books. That replaces the plan's series-position
  rule.
- Only a title with a volume marker or a format tag searches AniList, so an
  ordinary book costs no AniList request. The searches stay cached for the
  session; they are not persisted, because the persist allowlist keeps out
  unbounded search caches.

A reread of a completed entry runs it REPEATING from its own volume until
its last volume, which completes it and adds one to `repeat`. Hardcover's
reread flag covers one volume, so it never starts a reread on an entry that
isn't completed. Want-to-read removal
never routes AniList: the Planning entry is the series, and one volume
leaving the list can't decide it. The reconcile
leaves AniList out of the catch-up and reread decision, because the write
takes the higher volume count and can't duplicate.

### B6. Show a bridged work once

Continue Reading, the reading list and the diary show one card for a bridged
work. The open Hardcover volume is the card, because it holds the finer
progress ("p. 120 / 306"), and it carries the AniList id. The AniList entry
shows alone when none of its volumes is in the Hardcover library. The match
runs against the reader's own AniList list, which M3 already loads, so it
costs no request.

Built (#471). The M3 manga list read now asks for each entry's staff,
synonyms and volumes, and the Hardcover library and journal reads ask for
each book's authors and series. These are nested fields, so neither read
gains a request (KTD-9). Each item carries them as `readingCredits`, and
`bridgeBooks` (`lib/providers/reading-bridge.ts`) runs the B5 matcher over
the two lists. A match sets `bridgedAniList`, which groups cards. A
removal reads it only through a merged card's AniList source
(`removalItem`). A log never reads it and asks the B5 bridge as before.

- Continue Reading drops an AniList entry that a Currently Reading volume
  covers (`showBridgedOnce`).
- The reading list merges a planned AniList entry with one want-to-read
  volume into one card that lists both sources: the volume with the smallest
  item id, because Hardcover returns the list in no fixed order. A second
  volume of the work keeps its own card, so every card has one item a removal
  acts on. Two Currently Reading volumes of one work show as two cards on
  Continue Reading for the same reason.
- Removing a merged card asks (owner decision 2026-11-18): the remove sheet
  lists Hardcover and AniList, both selected. Its confirm step, in the same
  drawer, shows one line per provider ("Deletes the Planning entry.", "Leaves
  Want to Read.") before anything goes. Every removal now takes this step.
  The step removes only the providers it showed, and only a provider whose
  own line warned lifts its refusal guard.
  Removing from the AniList entry's own screen removes only that entry. The
  AniList removal uses the entry the card's AniList source proves, never a
  search, and its confirm line names that entry.
- The screens group cards against the whole AniList list, and only titled
  volumes (B5's gate).
- The diary groups a journal book under its AniList entry from the manga
  list, which it loads once a page holds a book. A same-day row that holds
  both leads with the book. Rows join only when their chapter sets are equal.
  Whether AniList writes a list activity for a volume-only update, and with
  which progress, is unverified until the owner's first live log.

### C0. Choose a comics tracker — dropped

The owner decided on 2026-11-18 that Shinobu does not track comics. #401
closed as not planned.

## Out of scope

Goodreads RSS, Google Books, MyAnimeList, MangaUpdates, Kitsu and Literal
(see the spike), comics (C0), audiobook seconds, reading goals and personal
ratings.

## Build

M1–M4 and B1–B6 are JS only and hot reload. B1's OAuth return on native uses
the existing `shinobu://` scheme, so no prebuild is expected unless B0 needs a
second scheme.
