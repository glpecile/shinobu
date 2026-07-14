# Trakt watched endpoints: 2026 breaking changes (images gone, pagination required)

## Symptom

Mid-July 2026, without any app change: "Your Shows" cards lost their posters on
**both** native and web (so not a styling/uniwind issue — the data itself), and
the details screen showed `Progress: 0 episodes` for shows with logged
episodes.

## Cause

Trakt announced breaking changes to `/sync/watched/*` and
`/users/:id/watched/*` ([trakt-api discussion #775](https://github.com/trakt/trakt-api/discussions/775)),
**enforced after June 30, 2026**:

1. **Images removed entirely.** `extended=full,images` no longer returns an
   `images` object on watched responses — there is no parameter that brings it
   back. Official guidance is to fetch art per item (catalogue endpoints still
   return images) or from TMDB.
2. **Season progress no longer included by default.** The old response's
   `seasons[].episodes[]` breakdown — which `normalizeWatchedShow` used to
   compute `currentProgress` — now requires `extended=progress` (which caps
   pages at 100 items instead of 250).
3. **Pagination is mandatory.** A single request no longer returns the full
   watched history; clients must loop `page`/`limit` until a short page.

## Fix

- `getWatchedShows`: `?extended=progress&page=N&limit=100`, looping pages until
  a short page (capped at `WATCHED_MAX_PAGES = 10` so a huge library can't turn
  one query into dozens of round-trips).
- `getWatchedMovies`: default extended (now full metadata) + the same
  pagination loop at `limit=250`.
- **Art recovery is lazy, per item**: `useTraktMediaImages(item)` (in
  `state/queries/trakt.ts`) returns the item's own art when present
  (trending/search items are unaffected) and otherwise fetches
  `/{movies|shows}/:id?extended=full,images` — one small public request per
  *rendered* artless card, cached with `staleTime: Infinity` since art doesn't
  churn. `MediaCard` and the details hero consume the hook instead of
  `item.coverImage` directly. Never bulk-enrich the whole watched list up
  front — that's O(library) requests against a 1000-per-5-min rate limit.

## Lesson

Provider read contracts rot on the provider's schedule, not ours: this broke
on Trakt's enforcement date with zero code changes on our side. When a
previously-fixed symptom "comes back", check the provider's changelog/forums
before re-debugging the app — and keep an eye on announced enforcement dates
(discussion #775 was published months ahead).
