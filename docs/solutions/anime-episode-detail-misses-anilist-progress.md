# Anime accordion says Rewatch but episode details say Mark as watched

Owner report, 2026-09-27: Link Click: Bridon Arc's anime accordion showed
every episode watched, while the S3E6 detail offered Mark as watched.

The anime accordion reads AniList entry progress. `useEpisodeLogs` only read
Trakt and Simkl, so it discarded that evidence on navigation. The Simkl cour
fix covered the TV accordion, not this separate anime accordion.

The episode detail now reads the same AniList entry and maps its watched
entry-relative episodes through ani.zip and `placeInLayout`, the same mapping
used when opening an accordion row. Only explicitly mapped episodes at or
below that entry's progress count as watched. A shared TMDB ID never grants
another cour's episodes a watched mark. No per-episode date is invented.

The screenshots also exposed reversed titles: E1 read "Episode 6 - Puzzle".
AniList streaming metadata was joined by array position, even though the
response can be newest-first. Join numbered titles by their episode number;
unnumbered titles use the existing synthetic fallback rather than guessing.

Regression fixtures cover completed and partial Bridon progress, missing
mappings, and reversed streaming metadata with duplicate provider entries.
Live account verification remains outstanding because the browser is not
connected to this session.
