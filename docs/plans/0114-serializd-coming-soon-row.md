# 0114 — Serializd Coming Soon row

Home gets a Serializd "Coming Soon" row directly under Your Watchlist: each
followed show's next air day, on This Week's landscape cards. It mounts only when
Serializd is connected, hides when nothing is upcoming, and has no View all.

- Source: `GET search/upcoming_episodes_v3` (`docs/solutions/serializd-upcoming-episodes-endpoint.md`).
  First page only, cached an hour. `getSerializdUpcoming` normalizes each item
  onto its TMDB show (`tmdb-tv-<id>`), so cards open the same details and
  episode routes as every other TV item.
- The read requires a Serializd session (`auth: true`). Signed out the route
  answers 200 with an editorial set, which must never reach the feed.
  Validate the bearer with `validateAuthToken` before each fetch because a
  revoked bearer receives the same fallback. Home refresh includes this query;
  hidden items stay hidden and the row wakes at local midnight and on foreground.
- Without a TMDB token a `tmdb-tv-<id>` has no cold read, so
  `findInSerializdUpcomingCache` resolves it from this query, as Serializd
  lists already do.
- Episodes whose air date has passed in the user's timezone drop out; they are
  Continue Watching's job.
- Continue Watching, This Week and Coming Soon share `EpisodeCardRail`
  (virtualized, keyed per show). Episodes of one show on its next air day stack
  through `groupDayEntries`, so a season drop is one card. The badge is the air
  day ("Tomorrow", "Thu, Nov 5", with the year outside this one) plus Premiere
  or Finale; Serializd states no air time. TMDB's "Episode N" placeholder names
  are dropped.
- `/coming-soon-demo` (dev only) stacks worst-case, empty, one and 1,000-card
  fixtures through the query cache, beside `/up-next-demo`.
- Web reaches it through one new exact-match GET rule in `worker/serializd-proxy.ts`.
  `search/` stays closed otherwise; it also carries user search.

Open:

- The signed-in response is unverified. Confirm the endpoint personalizes the
  row on a real account; token validation rejects the known revoked-session
  fallback but does not prove the valid-session payload is personalized.
- Later-cour anime uses TMDB numbering and art: Ramparts of Ice 2nd Season
  reads as `S1E18` on the show's season-1 poster, while AniList's This Week
  card calls it `E4`. A show tracked in both appears in both rows that week.
  The log from the episode screen is the existing TMDB TV path
  (`anime-second-cour-serializd-skips.md`).

Hot reloads (`src/`); restart `bun run dev:worker` for the proxy rule.
