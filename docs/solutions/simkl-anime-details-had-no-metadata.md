# A Simkl anime's details page had no synopsis, genres or other titles

**Symptom (2026-11-17).** `/details/simkl/2764258` (_Seitokai ni mo Ana wa
Aru!_) showed a title, a year and a poster. It had no overview, no genres, no
runtime, and the copy sheet listed no English or native title. A cold link to
the same page also had no Seasons, Related or credits sections.

## Cause

Two facts met.

- A Simkl anime row carries art and ids only. `/sync/all-items` sends no
  synopsis, genres or alternate titles.
- `applyPrimaryMetadata` withholds TMDB's text fields from every anime series,
  because TMDB describes the whole show and the entry is one cour
  (`anilist-cour-vs-tmdb-series-metadata.md`). That rule assumes the entry
  brings its own text, which is true only for an AniList item.

The AniList record was read only for an `anilist-<id>` item, so nothing filled
the gap.

The cold link was worse. `/search/id?simkl=<id>` answers with `simkl` and
`slug` only (checked 2026-11-17, for anime, TV and movies). The item had no
AniList or TMDB id, so every id-keyed section stayed hidden.

## Fix

`useResolvedMediaItem` reads the AniList record for any anime that is not
AniList-minted but carries an AniList id, and fills the missing display fields
and titles from it. The tracker's title, art, progress and `isFilm` stay. The
read shares the cache entry of the Related section, so the page sends no extra
request.

A cold Simkl anime link first reads its ids from `/anime/{id}`
(`useSimklAnimeIdsQuery`), the same public read the log path uses.

## Still open

A cold Simkl TV or movie link gets no TMDB id from `/search/id` either.
