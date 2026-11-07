# Anime season shelves

The seasons explorer shows a signed-in user's own titles first. Watching, On
your watchlist and Seen fold above New to you, on the filmography's
`RailHead`. Each poster or row says when its next episode airs.

## Data

- **Airing:** `nextAiringEpisode` on the seasonal query. It needs no new
  request, it is public, and the home row's cache entry carries it too.
  `SeasonalAnimePage.nextAiring` maps item id to `{ episode, airingAt }` (ISO).
- **Shelf:** `useProgressLibraries` and `useItemProgress`. These are library
  snapshots that list progress already reads: AniList library, Simkl
  `all-items`, and Trakt watched movies when films show. There is one request
  per provider per session, no per-item request, and all three pager pages use
  the same snapshots. Completed is Seen. Progress, AniList `CURRENT`/`REPEATING`
  or Simkl `watching` is Watching. AniList `PLANNING` or Simkl `plantowatch` is
  On your watchlist.
- No watchlist gather. Trakt and Letterboxd watchlists match AniList titles
  only by title, and the gather costs four or five requests on a cold open.

## Layout

- One `List` of rows (`head`, `posters` chunked to `useWallMetrics` columns, or
  `entry`), like `credit-timeline`. It reuses `PosterCell` and `WatchlistRow`.
- Heads are `RailHead.Icon` + `RailHead.Count` without the rail line, with the home rails' glyphs. Folds
  persist in `collapsed-sections` and start open.
- With no title on a shelf (signed out, or nothing tracked), the rows are the
  plain wall, with no heads.
- The section in view pins under the screen header, as the diary's day does.
- The wall waits on its skeleton until the libraries settle, so titles do not
  jump into shelves after they paint.

JS only. Hot reloads.
