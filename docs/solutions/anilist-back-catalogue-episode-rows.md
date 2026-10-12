# AniList back-catalogue episodes labelled Unaired

AniList 5630 (Eden of the East, 2009) supplies streaming episode titles but no airing schedule. The detail rows and season-wide logging used only `hasAired(firstAired)`, turning missing dates into Unaired even though the shared catch-up catalogue rule already allows released, undated back-catalogue episodes.

Anime details now pass `airedAnimeEpisodes` evidence to the shared list's episode rows and season-action gate, reuse it to select batch episodes, and preserve it in the episode actions sheet when no canonical date is available. TV keeps its date-based defaults. Explicit dates always win in the sheet; future scheduled episodes and announced undated seasons stay blocked. No air dates are fabricated.

The regression belongs to `season-rows.test.ts`; catalogue-gap and future-schedule boundaries remain covered by `catch-up/queue.test.ts`.
