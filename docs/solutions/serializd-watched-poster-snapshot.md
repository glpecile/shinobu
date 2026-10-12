# Serializd watched posters use an account snapshot

The shared watched eye previously checked only Trakt and Simkl. Serializd list
items already carry a TMDB TV ID, but a Serializd-only viewer had no watched
read to match it against.

The retired `/user/{username}/show/{id}/progress` endpoint cannot supply that
read (see `serializd-watchlist-clears-watched.md`). A read-only public probe on
2026-10-12 confirmed `watchedpage_v2/1?sort_by=date_added_desc` still returns
`items` with `showId`, `seasonIds`, `dateAdded`, `showName`, `bannerImage`, and
`totalPages`. The probed account reports 13 pages. No session or history changed.

Mounted TV marks share one account-keyed query that sequentially reads all
reported pages, cached for five minutes. No per-poster page fan-out or timer
is used. A later-page failure fails the snapshot instead of caching a partial
library as complete. Logging to Serializd invalidates this snapshot, and the
existing provider-root disconnect clears it.

The eye means series watch history: a nonempty watched-season membership,
not completion of every episode or of the particular episode/season listed.
The accessibility label explicitly says “Series watch history.” Episode counts
are not inferred from season IDs. This also applies to person/studio posters;
details and logging retain their existing richer watched/progress hooks.

Native uses the existing direct transport; web uses the existing approved
Serializd proxy's user GET rule. No proxy grants or native rebuild are needed.
