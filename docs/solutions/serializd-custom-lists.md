# Serializd custom lists

Investigated 2026-10-08 against the live API and Serializd's shipped web client.

- `GET /api/user/{username}/lists?sort_by=date_created_desc&page=1` and
  `GET /api/user/{username}/liked_lists?sort_by=liked_on_desc&page=1`
  return `{ lists, totalPages }`. Each summary includes `listId`, `listName`,
  `owner.username`, `numberOfItems`, and up to ten `listItems` for previews.
- The sort token matters: `sort_by=date` silently returned an empty created
  index and a 500 liked index for a user whose lists existed. Use the web
  client's `date_created_desc`, not a guessed token.
- Liked lists default to `liked_on_desc` in the shipped client. On the website,
  created and liked are tabs under `/user/{username}/lists`; `/liked_lists`
  is an API path, not the external profile route.
- `GET /api/list/{id}` returns metadata and `listItems`. `?page=2` is ignored:
  it returned the same 32 entries for list 732170. Do not claim pagination
  unless the metadata explicitly carries `totalPages`.
- The shipped client pages large lists through
  `/mobile/page/list/list_items/{id}`. This is outside the existing API proxy
  boundary; don't add a broad mobile proxy. If the API response is incomplete,
  link to the original list rather than silently treating it as complete.
- Entries can be shows, seasons, or episodes. Keep the composite entry identity
  (`showId`, `seasonId`, episode number); never deduplicate them by show.
- Reads use the existing Serializd transport and app headers. Authenticated
  reads attach the session token, allowing upstream to decide private access.
  The Worker only needs an exact numeric `list/{id}` GET rule; user index reads
  already sit within its existing `user/` GET boundary.
- Serializd's client exposes POST `/list/likes/add` and `/list/likes/remove`
  with `{ show_list_id }`. This task is browsing only; editing/liking remains
  available through the external list link, with no new write grants.

Public probes used `/user/Maurizio82/lists`, its empty liked index, and
`/list/732170`. No account or list was changed.
