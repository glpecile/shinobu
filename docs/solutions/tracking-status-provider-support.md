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

The API serves `paused_shows_page` and `dropped_shows_page` reads. No status
write is verified, and the web proxy allowlists no such path. Manual link.
