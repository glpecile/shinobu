# A new anime release logged before ani.zip mapped it

**Symptom (2026-11-07).** *Demons' Crest* (AniList 203275) premiered on
2026-11-06. Episodes 1 and 2 skipped Serializd with "ani.zip has no episode
mapping for this entry yet".

## Cause

ani.zip lags a new release by days. It had the entry, but with no TVDB or TMDB
id and an empty `episodes` block. Simkl already knew TMDB 328010, which has one
season with 3 episodes. The prequel fallback in
`anime-second-cour-serializd-skips.md` did not apply, because the show has no
prequel.

The missing TV ids broke two more paths. An AniList-origin log had no TMDB id,
so Serializd and Trakt were never targets and showed no skip. A TMDB-origin log
had no AniList id, so AniList was never a target.

## Fix

`getSeriesNeighbours` returns `prequel: 'none'` only when AniList returns its
relations and none is an anime `PREQUEL`. Then, if ani.zip answered with an
empty table, `entryEpisodeMap` maps entry episode n to S1En (absolute n), and
`placeInLayout` still checks every row against the tracker's seasons. An
unknown prequel (an AniList failure, missing relations, an unknown episode
count, or several prequels) or a failed ani.zip read still skips.

When ani.zip has no TV ids, `enrich.ts` bridges through Simkl's public
`/search/id` and `/anime/{id}` (`cachedSimklAnimeIds`). Both are CORS `*`,
checked 2026-11-07, and `/anime/{id}` returns every id without
`extended=full`. Simkl keeps one record per cour, and every cour carries the
show's TMDB id. A TMDB-origin log therefore takes Simkl's AniList id only when
that entry has no prequel. Both Simkl reads cache for one hour, not forever,
because Simkl links a new release's ids over its first days.
