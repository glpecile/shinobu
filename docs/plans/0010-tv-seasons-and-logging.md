# 0010 — TV Seasons View & Episode/Season Logging

## Goal

Bring the TV detail screen up to feature parity with the movie detail screen:
seasons + episodes are visible on the detail screen as expandable accordions
(per Trakt's UI), and logging — either a **single episode** or a **whole
season** — opens the same kind of confirmation sheet movies use (backdate
`watchedAt`, per-provider partial-failure surface). Show the **complete series
runtime** in a dedicated stat tile, not just per-episode minutes.

This supersedes the "out of scope for first pass" note in plan 0007 and the
deferred-picker comment in `log-media-button.tsx`.

## Out of scope

- Up Next / `hasAired.ts` timezone-correctness for unaired-episode gating of
  the feed (still todos/006). The seasons view shows all aired episodes from
  Trakt's seasons payload; shows unaired ones too but marks them distinctly.
- AniList / Letterboxd write adapters for TV (TV → Trakt only today, per
  `routing.ts` / `registry.ts`).

## Data contract changes (`types/media.ts`)

```ts
export interface NormalizedEpisode {
  /** Season-relative episode number. */
  number: number;
  title: string;
  overview?: string;
  /** ISO instant with offset/Z, or absent when Trakt has no air date. */
  firstAired?: string;
  /** Minutes. */
  runtime?: number;
}

export interface NormalizedSeason {
  number: number;
  /** "Season N"; "Specials" for season 0. */
  title: string;
  episodes: NormalizedEpisode[];
}
```

These never reach `NormalizedMediaItem` (still the flat feed contract); they
live behind a suspense query keyed by trakt id, the same shape as people/
studios — components fetch them as a detail-screen-only section.

## Trakt endpoints

1. **`/shows/:id/seasons?extended=full,episodes`** (public, client-id only) —
   the full seasons + episodes structure (title, overview, first_aired,
   runtime). Normalize into `NormalizedSeason[]`. Sort seasons ascending, but
   move season 0 (Specials) to the end (matches how TV apps present them).
2. **`/shows/:id/progress/watched`** (authenticated) — per-episode
   `completed` booleans grouped by season, only fetched when Trakt is
   connected. Normalize into a `ReadonlySet<string>` of `"${season}-${number}"`
   watched keys. This is a *targeted* call (one show) rather than rescanning
   the full `/sync/watched/shows` payload — the feed's flat contract stays.

## Write path: batch episodes

`LogMediaVariables` and `TraktLogOptions` gain an `episodes?: Array<{ season:
number; number: number }>` field (alongside the existing single `episode?`).
The Trakt adapter groups the batch by season into one `/sync/history` POST body
(multiple `seasons[].episodes[]`) — one network round-trip per log, whether
it's one episode or a whole season. Single-`episode` is kept for backward
compat; a whole-season log passes the episode list.

`useLogMedia` invalidation already covers `watchedShows()` + `watchedMovies()`
on trakt success; it now also invalidates per-show `seasons` queries and the
new `watchedProgress` keys.

## UI

- **`SeasonsSection`** (new, `src/features/show-seasons/`) — mounted on the
  detail screen for TV only, behind `SuspenseSection` (skeleton fallback),
  same pattern as `PeopleSections`/`StudiosSection`. Renders one
  `SeasonAccordion` per season.
- **`SeasonAccordion`** — collapsible header (`Season N · M episodes · Xh Ym`)
  with a "Log season" button; expands to episode rows: watched checkmark,
  `E{n} · title · runtime`, and a per-episode "Log" affordance. Both log
  actions route through the shared confirm sheet.
- **`LogConfirmSheet`** (extracted from the movie `LogMediaButton`) — the
  generic confirm/backdate/per-provider-outcome sheet. Movies use it for a
  single watch; TV uses it with the pending log target (single episode list or
  whole-season episode list). Same `useLogMedia` mutation, same haptics.
- **Series runtime tile** — a new stat tile next to Progress/Total showing the
  computed total runtime (`Xd Yh`), summed from the seasons structure when
  available, falling back to `runtime × totalEpisodes`. TV only.

## Risks / decisions

- **Two show-scoped network calls** per TV detail (seasons + progress) hit a
  boundary a feed item doesn't. They're cached under stable query keys and run
  behind a suspense section, so the hero/poster/overview never wait on them.
- **Progress endpoint availability**: `/shows/:id/progress/watched` is only
  meaningful when Trakt is connected; the seasons section still renders
  watchability-agnostic when disconnected (no checkmarks).
- Recycling/keyboard concerns don't apply — this is a short `ScrollView`, not a
  `Legend List` surface.