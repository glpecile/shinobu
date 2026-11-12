# ani.zip's TMDB id has no kind — a movie can resolve to a TV anime

**Symptom (2026-11-12):** `https://api.ani.zip/mappings?themoviedb_id=1429`
returns Attack on Titan (AniList 16498, `type: "TV"`). TMDB movie 1429 is a
different, live-action film. Logging that film adopted AniList 16498, routing
added AniList as a target, and the write marked the anime `COMPLETED`.

## Cause

The anime-lists dataset (Fribb) stores the kind (`{"tv": 1429}` or
`{"movie": [635302]}`). ani.zip flattens it to one `themoviedb_id`. TMDB movie
and TV ids share one number space, so the number alone is ambiguous.
`mappings.type` does not tell the kind: 675 records with `type: "MOVIE"` carry a
TV id (a film filed as a special of a TVDB show).

Counted on 2026-11-12 over entries with an AniList id and a TMDB id:

| ani.zip record | TMDB id is a TV id | TMDB id is a movie id |
|----------------|-------------------:|----------------------:|
| has `thetvdb_id` | 6,953 | 253 |
| has no `thetvdb_id` | 8 | 1,066 |

## Fix

`aniZipTmdbKind` in `src/lib/providers/mapping/anizip.ts`: a record with a TVDB
id carries a TV id (96.5%), one without carries a movie id (99.3%). Every
reader of an ani.zip `tmdb` must ask it. The 253 real movie ids on a record
with a TVDB id (Mugen Train) count as unknown. They fall to the AniList film
search by title and exact year.
