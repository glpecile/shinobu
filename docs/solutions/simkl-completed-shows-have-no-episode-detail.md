# A fully-watched Simkl show reads as unwatched

**Symptom (2026-08-01).** Doctor Who — 153/153 watched on Simkl — showed every
episode of every season with an unticked "Mark as watched", on web and iOS.
Opened from search instead of a library row it was worse: `0 / 153`, no watched
line, and a "Log S1E1" button (later no log button at all).

Three independent bugs stacked into one screen. Each was found only by reading
the live entry — the first two diagnoses from the code were wrong.

## 1. A watched show is `completed`, and no read asked for that

`useSimklWatchingEntryQuery` read the `watching` snapshot, then `plantowatch` on
a miss. Simkl holds **one status per item**, so a finished show is in neither —
`hold` and `dropped` were invisible for the same reason. This was the "trap for
later" in `simkl-only-tv-details-trakt-gated.md`, and it is now closed:
`simklLibraryQuery()` reads `/sync/all-items` **unfiltered**, so every status
resolves. That is also *fewer* requests than the chain it replaced — one, not up
to three sequential round trips each waiting on the previous miss — and one
cache entry for every details surface.

Up Next deliberately keeps the narrow `watching` snapshot: Continue Watching
treats every entry it reads as a candidate, so widening *that* read would put
finished and dropped shows on the home feed.

## 2. Simkl omits `seasons[]` entirely for a `completed` show

The one that could not be guessed. With `episode_watched_at=yes`, a `watching`
entry carries per-episode instants; a **`completed` entry carries none at all**.
Verified live:

```json
{"status":"completed","entryProgress":153,"watchedEpisodes":0,"size":0,
 "entryIds":{"simkl":8530,"tmdb":57243,"tvdb":78804,"imdb":"tt0436992"}}
```

So `watchedKeys` was empty for a show watched end to end, and the accordion
rendered it literally. Fix (`show-seasons/seasons-section.tsx`): status
`completed` with an empty key set **means** every aired episode, so the season
layout on screen becomes the key set — `hasAired`-filtered, because ticking an
unaired episode is a worse lie than a missing tick. The watched line reads
`item.currentProgress` (`watched_episodes_count`) rather than
`watchedKeys.size`, since the count survives where the episode list doesn't.

## 3. Progress was read from the navigated item, not the provider entry

`NormalizedMediaItem.currentProgress` is a property of *the surface the user
tapped*. A Simkl library card carries 153; a TMDB search result for the same
show carries 0. `useSeriesNextEpisode` fed the item's copy into
`nextEpisodeFromSimklEntry`, whose caught-up check then read `0 < 153` and
answered "can't name the next episode" — hiding the log button outright. The
stat tile showed `0 / 153` from the same source.

**Rule:** when a provider entry resolves, *it* is the statement of user state;
the item's copy is a snapshot of wherever the tap came from. Both call sites now
prefer `entry.item.currentProgress`. AniList already did this
(`useAniListEntryStateQuery` corrects the tile); TV had no equivalent.

## Bonus trap: `enabled: false` does not gate the *answer*

`useSimklWatchedInfo` is film-only and passed `enabled: filmLike`. But `enabled`
stops the fetch, not the cache read — and the snapshot is one shared entry, so
on a TV screen (where another hook had already populated it) `select` still
returned a real entry. A fully-watched *series* reported as a watched *film* and
the details line rendered "Watching · 153 episodes logged" from the movie path.
Gate the return value, not just the request.

## How this was actually found

Three code-reading hypotheses (key-format mismatch, TVDB-vs-TMDB season
numbering, wrong bucket) were all wrong. What settled it was one temporary
`console.log` of the live entry, read back through argent's
`debugger-log-registry`. `view-network-logs` is no help here: it hooks
`fetch()`, and native traffic goes through `react-native-nitro-fetch`.
