# Planned AniList premieres disappeared after airing

The PLANNING gate excluded every aired entry. A title visible in Calendar
therefore vanished at its premiere, even though Simkl already admitted recent
watchlisted premieres to Continue Watching.

AniList now admits a planned premiere for seven days after episode 1 airs.
The existing list request also reads the earliest scheduled episode. Its air
instant survives the next-airing pointer advancing to episode 2 or becoming
null. No second request or persisted UI state is needed.

Classification still uses `hasAired` with the live clock. Future premieres stay
in Calendar, old planning backlog stays out, and unknown premiere dates cannot
prove recency. The existing premiere test covers the instant boundary, refreshed
pointers and expiry. The watchlist still includes CURRENT and PLANNING entries.

The live Blue Box API probe returned episode 1 from `airingSchedule(perPage: 1)`
even with `nextAiringEpisode: null`. This Media field does not accept `sort`;
adding it makes AniList reject the entire list query with HTTP 400. Request the
first page and only retain a node whose episode number is 1.
