# Simkl anime cours share a show ID, not watched state

## API spike, 2026-09-27

Source: https://api.simkl.org/api-reference/simkl/get-all-items and its
embedded OpenAPI schema, retrieved before implementation.

`extended` is a single enum value. `full_anime_seasons` is documented as
"like full, plus TVDB season/episode mapping on anime". It also supports
`episode_watched_at=yes`. Use that value for the existing all-types request;
neither comma-separated flags nor a separate anime request is needed by the
documented contract. This was a documentation spike, not an authenticated
response comparison. No live Simkl token was available in this session.

The response example puts `mapped_tvdb_seasons` on the library entry, beside
`show`, not inside `show`. Episode rows carry `tvdb.season` and `tvdb.episode`.
`completed` and `dropped` still omit episode rows by default. The newer
`include_all_episodes` option can load them, but is not required for this fix.
The schema also puts `anime_type` on the entry. Read it there first so anime
films cannot enter a TV episode merge through a colliding TMDB movie ID.

## Watched-state contract

An anime entry identifies one cour. An exact Simkl match must win before any
TMDB fallback, and a non-film ANIME item still cannot fall back on TMDB alone.
A TV-shaped item can combine non-film anime entries sharing its TMDB show ID
for its canonical episode-state view. This view uses explicit TVDB coordinates;
missing mappings never become season 1 by assumption. The library's original
episode numbers remain available to the entry-relative anime diary.

Completion with no episode rows applies only to `mapped_tvdb_seasons` for
anime. Missing mapping means no inferred checkmarks. Ordinary TV retains its
whole-show completion rule. Both the episode log button and season accordion
must use this same provider/query-layer view and aired-episode predicate.
If another tracked, incomplete cour maps to the same season, suppress the
season-wide inference and retain only explicitly mapped watched episodes.

TVDB and TMDB can disagree on episode ordering. This change uses Simkl's
documented canonical mapping and does not infer offsets or reorder episodes.
The owner's Saga of Tanya the Evil S2E11 state still needs live-account
verification before todo 016 can close.
