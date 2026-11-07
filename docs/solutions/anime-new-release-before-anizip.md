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

The missing TV ids also left an AniList-origin log with no TMDB id, so
Serializd and Trakt were never targets and showed no skip.

## Fix

`getSeriesNeighbours` returns `prequel: 'none'` only when AniList returns every
relation in full and the entry relates to other TV or ONA series only as their
prequel. A later cour can be `OTHER` instead of `SEQUEL` (Cyberpunk:
Edgerunners 2), so any other series relation leaves the answer unknown. Then,
if ani.zip answered with an empty table, `entryEpisodeMap` maps entry episode n
to S1En (absolute n), and `placeInLayout` still checks every row against the
tracker's seasons. An unknown prequel or a failed ani.zip read still skips.

When ani.zip has no TV ids for an AniList anime, `enrich.ts` bridges through
Simkl's public `/search/id` and `/anime/{id}` (`cachedSimklAnimeIds`). Both
are CORS `*`, checked 2026-11-07, and `/anime/{id}` returns every id without
`extended=full`. Both reads cache for one hour, not forever, because Simkl
links a new release's ids over its first days.

The reverse bridge, TMDB show to AniList id through Simkl, is not safe. TMDB
items carry no TVDB id, so it would run for every animated TMDB show. Simkl
names the first cour, and a TMDB season can span several cours (SPY×FAMILY S1
is 25 episodes over two 12- and 13-episode entries), so AniList would get
progress past the entry's end.
