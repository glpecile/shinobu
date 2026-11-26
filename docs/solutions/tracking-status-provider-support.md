# Pause and drop: what each provider supports

Findings behind `trackingStatus` in `lib/providers/registry.ts` (#227, plan
0123). Checked against the provider docs on 2026-11-23.

## AniList

`SaveMediaListEntry(mediaId, status)` with `PAUSED` or `DROPPED`. The log
adapter already sends `status` and `progress` alone to existing entries, so
the pause relies on the same partial update. Confirm on a real entry that
progress, score, notes, dates and custom lists stay. A rewatch (`REPEATING`) is not paused: the next log
would write CURRENT and the finished rewatch would not count.

## Simkl

`POST /sync/add-to-list` with a per-item `to: 'hold' | 'dropped'`. TV and
anime take all five statuses. Films take only `plantowatch`, `completed` and
`dropped`, and routing sends no film.

`POST /sync/history` "automatically places (and re-classifies) the item on the
right Watchlist", and the docs say not to follow it with `add-to-list`. So a
new log resumes a paused show with no extra request. The docs do not say that
a move to `hold` or `dropped` keeps watched episodes, timestamps and the
rating. Confirm it in the app on a real show.

The documented 20-second write lock covers `/scrobble` and `/sync/history`
only (api.simkl.org/resources/rate-limits), so the status write does not go
through the log queue.

## Hardcover

`update_user_book(id, object: { status_id })` with Paused (4) or Did Not
Finish (5). Never Ignored (6) and never `delete_user_book`. To confirm in the
app, not by a probe: the open read keeps its pages on the change, and the next
page log's change back to Currently Reading reuses that read rather than
opening a second one. `logToHardcover` reads the entry again after the status
change and writes the page to the read it finds open.

## Trakt

No pause or on-hold status. The legacy API blueprint documents a `dropped`
section for `POST /users/hidden/{section}` (whole shows only, with a remove
endpoint), but not its effect on history, progress or Up Next. Trakt stays a
manual link until that is verified.

## Serializd

Found on 2026-11-23. The API is unofficial, so the three sources below are the
ones `serializd-watchlist-endpoints.md` describes. Run them again if a path
moves.

| Path                                              | Method | Body or query               |
| ------------------------------------------------- | ------ | --------------------------- |
| `paused_shows`, `dropped_shows`                   | POST   | `{ show_id }` (the TMDB id) |
| `paused_shows/remove`, `dropped_shows/remove`     | POST   | `{ show_id }`               |
| `currently_watching`, `currently_watching/remove` | POST   | `{ show_id }`               |
| `user/{username}/paused_shows_page/{page}`        | GET    | `?sort_by=date_added_desc`  |
| `user/{username}/dropped_shows_page/{page}`       | GET    | same                        |
| `user/{username}/currently_watching_page/{page}`  | GET    | same                        |

- The site bundle has the payloads:
  `e3=A=>{let e="/api/paused_shows";return c.post(e,{show_id:A})}`, and the
  same shape for the other five POSTs.
- The Django debug 404 lists all nine routes.
- Without a token each POST answers `401 {"message": "You must be logged in"}`,
  a GET on it answers 405, and `paused_shows/nope` answers the HTML 404.

The status is per show, not per season. The page reads are public. They return
`{ items: [{ showId, dateAdded, showName, bannerImage }], totalItems,
totalPages }` with 24 items per page, and answer 500 without `sort_by`. There
is no per-show status read, so a status needs every page of the three lists.

**Watched seasons stay.** On a real account, 11 of 17 paused or dropped shows
still hold their season ids in `watchedpage_v2`. No show was on two of the
three lists at once.

A show on no list with watched seasons counts as watched and can move. With
every season watched (`numSeasons`), it counts as completed and never moves.

The site's client removes the show from Currently Watching after it adds it to
Paused or Dropped, and removes all its seasons from the watchlist. The adapter
does the first and leaves the watchlist alone. It also removes the show from
the opposite list on a move between Paused and Dropped. The site's client does
not, and whether the server does is unknown.

Not verified, because no authenticated write was sent:

- the response bodies of the six POSTs. The adapter accepts any 2xx.
- whether `…/remove` on a show that is not on the list is an error. The
  adapter sends a remove only for the list a fresh read found the show on.
- whether the server moves a paused show back on a log. The site's client
  sends nothing on a log. Its only move back is Add to Currently Watching,
  after which it removes the show from Paused and Dropped. So after each log
  the adapter reads the Paused and Dropped pages. If the show is on one, it
  posts `currently_watching` and then that list's `remove`. A failure here
  does not fail the log, and the next log tries again.

Rollback: set Serializd's `trackingStatus` to `'manual'` in the registry. The
proxy rules do nothing without a caller.
