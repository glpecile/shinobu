# Pause and drop tracking (#227)

A user can pause or drop a series or a book once, and the status goes to every
connected provider that supports it. Progress and history stay. There is no
Resume control: a new log resumes tracking.

## Decisions

- **A fourth write verb, not a new framework.** `useTrackingStatus`
  (`features/tracking-status/`) runs the same steps as the watchlist verbs:
  enrich, route, `runProviderWrites`, invalidate, reschedule notifications.
  It reports per provider, retries only the failed providers, and links the
  manual ones.
- **Declared in the registry.** `trackingStatus: WriteSupport` on each
  provider, read by routing as the `tracking` capability. `canWrite` does not
  imply it. AniList, Simkl and Hardcover write. Trakt and Serializd are manual
  links. Letterboxd is `none`.
- **Series and books only.** Routing returns no target for a film, an anime
  film, or a standalone manga (later, with the reading domain). A book
  bridged to an AniList manga or light novel routes to both providers, and
  the AniList side changes the entry status only.
- **Every adapter reads fresh, then decides** (`trackingStatusSkip`). Only an
  entry being watched or read, or already paused or dropped the other way,
  moves. No entry, a completed or planned entry, Want to Read or Read on
  Hardcover, and an AniList rewatch are skips with a reason and a provider
  link. A repeated request is a skip ("already paused"). No entry is created.
- **Resume is the existing log.** AniList's log writes CURRENT (or COMPLETED
  on the last episode). Simkl's `/sync/history` re-files the item by itself.
  `logToHardcover` sets Currently Reading on any entry that is not Currently
  Reading. No adapter sends an extra status request, and a skipped or failed
  log reports as such, never as resumed.
- **Merged feed.** Continue Watching reads AniList CURRENT, Simkl `watching`
  and Hardcover Currently Reading, so a paused entry leaves it after the
  invalidation. Trakt has no status, so a show it still tracks stays in Up
  Next. The picker says so beside the manual rows.
- **UI.** The details CTA row and the long-press sheet keep one capsule
  beside the main action. With only a list add it stays "+". When a target
  holds an entry pause or drop would move, it becomes "…" and opens Add to
  list, Pause tracking and Drop. The picker shows each provider's current
  status, because providers can disagree.

## Verification left to a person

- Hardcover: a change to Paused or Did Not Finish keeps the open read and its
  pages, and a change back to Currently Reading through the next page log
  reuses that read. No agent sends a Hardcover mutation, so this is checked in
  the app and recorded in `docs/solutions/tracking-status-provider-support.md`.
- Simkl: a move to `hold` or `dropped` keeps watched episodes and the rating.
  The docs do not say.
- AniList: a status-only save keeps progress, score, notes, dates and custom
  lists.

## Not built

- Trakt drop through `POST /users/hidden/dropped`. Its effect on history and
  progress is undocumented, and Trakt has no pause.
- Serializd status writes. No write endpoint is verified, and web would need
  a new proxy rule.
- Choosing the in-progress cour for a multi-cour TMDB show on AniList. The
  status goes to the entry the item maps to, and a completed cour is a skip
  with a link.
