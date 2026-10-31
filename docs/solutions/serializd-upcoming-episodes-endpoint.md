# Serializd upcoming episodes ("Coming soon")

**Observed 2026-10-31.** Found through the Django `DEBUG=True` URL list
(`serializd-watchlist-endpoints.md`, evidence B), still open on this date, and
confirmed in the web bundle:

```js
j=function(A){let e=arguments.length>1&&void 0!==arguments[1]&&arguments[1],t="/api/search/upcoming_episodes_v3";
return c.get(t,{params:{cursor:A,should_get_progress:e}})}
```

- `GET search/upcoming_episodes_v3?cursor=&should_get_progress=` returns
  `{ items, nextCursor, secondaryNextCursor, additionalData }`. `_v2` and the
  unversioned path are Django 404s.
- Each item is one episode: `showId` (TMDB), `showName`, `seasonNumber`,
  `episodeNumber`, `episodeName`, `airDate` (bare `YYYY-MM-DD`), `stillPath`,
  `runtime` (nullable), `isPremiere`, `isFinale`, `season.posterPath`,
  `backdrops[]`, and the full `show` object.
- Without app headers it is a 401. With them, both no bearer and an invalid
  bearer return 200 and the same 4-item editorial set. The status can't tell
  personalized from fallback.
- `search/premieres` exists but answered 500 signed out.

The Coming Soon read validates its bearer through the existing
`validateAuthToken` before requesting upcoming episodes. A nonempty bearer and
a 200 response alone do not prove authentication. A regression test covers the
revoked-token editorial fallback.

Re-probe: `curl` the path with the three app headers from `web-cors-serializd.md`.
