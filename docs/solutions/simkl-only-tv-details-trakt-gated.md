# Simkl-only TV details: no log button, no seasons (Trakt-gated surfaces)

**Symptom (2026-08-01).** With only Simkl connected, a TV show's details page
had no log button and no Seasons section — the card sheet fell back to
"Episodes are logged per season from the details page," which then offered no
way to log either. Anime (AniList) pages were unaffected.

**Root cause.** Two detail-screen surfaces were hard-gated on Trakt, which
plan 0034's detachment turned into dead ends for every non-BYO user:

- `SeasonsSection` returned `null` when `item.externalIds.trakt == null`, and
  the accordion fetched seasons only via `useSuspenseTraktShowSeasonsQuery`.
- `useSeriesNextEpisode` reported `unavailable` unless Trakt was connected
  *and* the item carried a Trakt id — which hid `LogMediaButton` for every
  Simkl-sourced series (its documented fallback was "the season picker", which
  the first gate had also removed).

**Fix.** Widen both to source-routed reads; no component talks to a provider
directly:

- `state/queries/show-seasons.ts` — `useShowSeasonsSource` resolves Trakt
  (BYO credentials present) → TMDB (token present) → hidden, and the seasons
  hooks share Trakt's existing cache key on that leg. The TMDB leg is the new
  `getTvSeasons` (`lib/providers/tmdb/reads.ts`): one `/tv/{id}` layout call,
  then `append_to_response=season/N` batches — TMDB caps appends at 20 per
  request, hence the chunking. TMDB `air_date` is **date-only**;
  `has-aired.ts` already parses that as local midnight, so the accordion's
  aired-gating works unchanged.
- `useSimklWatchingEntryQuery` (`state/queries/simkl.ts`) selects one show's
  entry out of the `watching` snapshot Continue Watching already caches
  (`simklWatchingLibraryQuery`, shared with `up-next.ts`) — zero extra
  requests in the common case. Its `watchedKeys` are already Trakt's
  `"${season}-${number}"` format, so the accordion checkmarks take either
  source verbatim.
- `nextEpisodeFromSimklEntry` (`features/log-media/series-next-episode.ts`)
  turns that entry's server-computed `next_to_watch` pointer into the one-tap
  log target. Deliberate edges: a null air date stays permissive (the Trakt
  rule — Up Next's stricter aired-by-count arithmetic is for auto-surfacing,
  not for blocking a deliberate log); a TV pointer with no season number
  (Simkl's absolute anime numbering) is *unnameable*, never "season 1"; a
  mid-show item absent from the `watching` snapshot is also unnameable and
  falls back to the (now working) season picker rather than guessing a season
  from a flat episode count.

**Trap for later.** The `watching` filter means shows parked in
completed/hold/dropped get no checkmarks and no rewatch label from Simkl —
degrade, don't widen to the full `episode_watched_at` library snapshot
without checking its size against
`docs/solutions/simkl-rate-limits-and-write-lock.md`.
