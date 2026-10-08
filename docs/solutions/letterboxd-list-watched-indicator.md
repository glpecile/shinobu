# Why the watched eye can't light on a Letterboxd list row

Attempted 2026-10-06, reverted same day. Recorded so the next attempt starts
from what is actually true, not from the assumption that was wrong first.

## The gap

A Letterboxd list film (`getListFilmsPage` → `normalizeWatchlistFilm`)
normalizes to a `NormalizedMediaItem` whose `externalIds` is `{ letterboxd:
<slug> }` and nothing else — no `tmdb`, `trakt`, `imdb`, `simkl`. The scrape
exposes no cross-provider ids. This is stated in `normalize.ts`'s own comment.

`WatchedMark` (src/features/credit-timeline/credit-timeline.tsx) resolves watched state through
`useWatchedInfo` (src/state/queries/watched-info.ts), which asks Trakt first
(`useTraktWatchedInfo`) then Simkl (`useSimklWatchedInfo`). Both legs match the
item against a provider snapshot by cross-provider id:

- Trakt (`state/queries/trakt.ts:250`): matches on `entry.externalIds.trakt ===
  traktId || entry.externalIds.tmdb === tmdbId`. With neither id, it returns
  null before looking.
- Simkl (`state/queries/simkl.ts:131` `findLibraryEntry`): matches on
  `externalIds.simkl`, then `externalIds.tmdb` (movies + anime films search
  `movies[]` and the `isFilm` anime entries). With neither id, it returns null.

So a list row can never show the eye as-shipped: the predicate has no id to
match on. The details page for the *same* film shows "Watched · <date>" because
`/details/[id]` re-resolves the slug to a full TMDB catalogue record
(`getMediaDetails`) carrying `tmdb`/`imdb`, and `useWatchedInfo` matches on
that.

## Why the fix that was tried is unreliable

The reverted change resolved each list film's slug to a TMDB id inside the
list-films `queryFn`, via `cachedTmdbMovieIdByTitle`
(`state/queries/mapping.ts`) — title+year → TMDB `/search/movie`, gated by
`pickMovieMatch`. Three facts make it miss on real data:

1. **`pickMovieMatch` returns null rather than guess.** That is deliberate and
   load-bearing (docs/solutions/trakt-text-search-wrong-movie-match.md): a
   wrong `tmdb` id poisons the log fan-out. A list film that collides with a
   same-title film gets *no* id, so no eye — correct behavior, indistinguishable
   from a bug to the user.
2. **Recall is popularity-ranked.** TMDB `/search/movie` ranks by popularity;
   an obscure film can fall off page 1 before the year gate ever sees it. The
   `primary_release_year` recall fix only fires on a year-filtered miss, and
   the unfiltered retry re-runs the same gate.
3. **The cache hides both.** The list query is `staleTime: 15min` and the
   mapping is forever-cached in memory, so a miss is sticky for the session.

The concrete case that surfaced this: *Vampire Hunter D* (1985) logged to
Simkl, showing "Watched" on its details page but no eye on the Horrortober VI
list. The details page resolves a confident id; the list row's title+year
search does not reliably produce the same one.

## What this implies for any next attempt

The badge needs the film's identity resolved the same way the details screen
resolves it, not a lighter-weight title search. Resolving N films per list page
through the full catalogue path is the cost
`docs/solutions/letterboxd-watchlist-release-resolve-cost.md` already documents
for Up Next — per-row on a paginated list it is heavier and was the reason this
was scoped out of plan 0061. Not a small change.
