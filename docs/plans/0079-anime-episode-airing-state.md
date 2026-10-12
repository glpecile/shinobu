# Anime episode airing state

Reuse the catch-up queue's `airedAnimeEpisodes` evidence for AniList detail rows, season logging, and the episode actions sheet. A released back-catalogue entry with no schedule is loggable; a published future date remains authoritative and announced undated seasons remain blocked. Keep TV's date-based defaults unchanged, and never invent episode air dates.

Validate the season-row integration against the existing catalogue-evidence tests, then run the isolated suite, lint, and typecheck. Source-only changes hot reload.
