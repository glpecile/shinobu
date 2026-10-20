# Custom list membership writes

Verified against the providers' shipped web clients on 2026-10-18. See plan
0093 for the concrete assets and payloads.

Letterboxd's `/list/add-films/` only opens an editor with pending additions.
It does not save them. The current editor saves through the same-origin
`PATCH /api/v0/list/{lid}`, sending versioned entry operations. Open the
authenticated `/owner/list/slug/edit/` page and read `data-list-lid`,
`data-list-url`, and `data-list-version` from `ListEditor`, as its own client
does. Do not make an extra `GET /api/v0/list/{lid}` to read the version: the
initial implementation did, adding a request that can fail with HTTP 403
before saving.
A direct read reproduced a `cf-mitigated: challenge` response on 2026-10-18;
the user's screenshot alone cannot identify which request was challenged.
Cloudflare may still challenge the save. Leave the tab open, report verification
clearly, and never retry an uncertain save automatically. Browser bridge 9
(userscript 0.8.1) replaces bridge 8 for membership editing; the UI offers the
script update instead of using the old flow. Decode the userscript's JSON
message envelope before displaying an error, preserving native plain text.

Load current
entries before selecting a zero-based deletion position; stale positions could
remove another film. A version conflict must fail, never retry automatically.
The `/s/load-list-entries` response is newline-delimited JSON, ending in a
`success` record. Never treat a truncated stream as a complete list.

Serializd's single-entry `/list/add_item` exists, but its client removes entries
by saving `/list/edit`. The read includes editor fields `listDescription`,
`listCollaborators`, `isPrivate`, `isRanked`, `allowsComments`, `bannerImagePath`,
and per-entry `description`. Preserve these fields, and refuse incomplete lists.
A show, season, and episode share a showId: removing by showId alone is wrong.
An incomplete list also cannot prove an unseen show is absent, so do not add
a show in that state and risk a duplicate. No authenticated Serializd session was available for the initial investigation.

The web proxy gives only exact `POST list/edit` a 1 MiB body ceiling. The
shipped editor supports 500 items, and a captured 499-entry removal payload
was 126,881 bytes before long notes; the normal 64 KiB cap rejected it with
413 before upstream. Other POST endpoints retain their 64 KiB ceiling.

After confirming a Letterboxd addition, mark its detail query stale without
immediately refetching it. A partial infinite query refetches only its loaded
prefix, which cannot include a film appended at the actual end of the list.
Keep the confirmed cache patch visible until explicit refresh or remount;
indices still refetch immediately, as do removals. The owning query regression
uses the actual mutation with an active infinite-query observer and fails
when an immediate refetch erases the addition.

## Creating lists

Verified against the shipped clients on 2026-10-20 (plan 0097). Letterboxd's
editor creates with same-origin `POST /api/v0/lists` and `X-CSRF-TOKEN`, using
the edit's `{ action: 'ADD', listable }` entries. A Public list is sent as
`published: true` with `sharePolicy: 'You'`. A non-public list can't be read by
Shinobu's public scraper, so after creating one, link to it on Letterboxd
instead of opening it here. The receipt's `links` entry of type `letterboxd`
carries the new list's URL. Serializd's `POST /api/list/create` answers
`{ listId }` and requires a name and 1–500 items.
Web creation uses userscript 0.9.0 (bridge 10), which opens `/list/new/` in the
signed-in tab and runs the same save. Bridge 9 reports no `list-create`
capability, so the editor offers the script update instead.
