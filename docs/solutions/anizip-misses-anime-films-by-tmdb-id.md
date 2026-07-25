# ani.zip's TMDB index is TV-oriented — anime films reverse-map to nothing

**Symptom (2026-07-25):** *ChaO* (2025) opened from its details page offered
Trakt + Letterboxd in the log sheet but **not AniList**, even with AniList
connected. Anime *series* opened the same way did include AniList.

## Cause

`features/log-media/enrich.ts` reverse-maps a movie/TV item into AniList's
world through ani.zip:

- TV → `{ tvdbId }`
- MOVIE → `{ tmdbId }`

ani.zip's mapping database is built around the TVDB/AniDB series world. Its
`themoviedb_id` coverage is good for series that also carry a TMDB id and
patchy for **films** — a recent anime film routinely has an AniList entry, a
TMDB entry, and no ani.zip row joining them. The lookup returns `null`, no
`externalIds.anilist` is adopted, and `effectiveTypes` (`routing.ts`) never
widens the MOVIE to also be an ANIME. Nothing errors; AniList just silently
isn't a target — for exactly the kind of item an AniList user cares about.

Note the asymmetry: an *AniList-origin* anime film maps fine, because that
direction goes AniList id → ani.zip → TMDB, and ani.zip does hold the AniList
id it is keyed by. Only the reverse (TMDB id → AniList id) has the hole.

## Fix (plan 0024 U6 / KTD3)

A discovery fallback on the **miss path only**:

1. `lib/providers/anilist/reads.ts` → `searchAnimeFilms` — a GraphQL search
   narrowed to `type: ANIME, format: MOVIE`, sorted `SEARCH_MATCH`.
2. `lib/providers/pick-movie-match.ts` → `pickAnimeFilmMatch` — **exact year
   required, no ±1 window**. There is no corroborating id here (ani.zip
   already missed), so a near-year guess could attach a wrong AniList id to a
   real log write. Within the exact-year set an exact title wins; otherwise
   the top hit is accepted, because AniList sorts by title relevance rather
   than popularity — the trap that motivated `pickMovieMatch` doesn't apply.
3. `state/queries/mapping.ts` → `cachedAniListFilmId`, forever-cached
   **including misses**. AniList's budget is 30 req/min
   (docs/solutions/anilist-rate-limit-retry-storm.md) and most films a user
   logs are live-action, so an uncached negative would spend the budget on
   guaranteed-empty searches. One request per (title, year), ever.

No routing change was needed: `effectiveTypes` already widens a `MOVIE` whose
`externalIds.anilist != null` to `['MOVIE', 'ANIME']`, so the discovered id
alone adds AniList to the fan-out. Serializd stays excluded — it is TV-only,
and a film is a MOVIE on the movie/TV side regardless.

**Guard rails in the code:** the fallback requires `type === 'MOVIE'`, a
non-empty title, a **known year**, and AniList connected. A yearless film
never searches (nothing would gate the result).
