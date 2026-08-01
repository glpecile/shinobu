import { Effect } from 'effect';

import type { ProviderError } from '@/lib/providers/errors';
import type { NormalizedDiaryEntry } from '@/types/media';
import type { SimklDeps } from './deps';
import type { SimklLibrary, SimklLibraryEntry } from './normalize';
import { getAllItems } from './reads';

const provider = 'simkl' as const;

/**
 * Simkl has no paginated history endpoint (nothing like Trakt's
 * `/sync/history`): watch history lives *inside* the `/sync/all-items`
 * snapshot as per-episode watched instants (`episode_watched_at=yes`) and a
 * movie's `last_watched_at`. So the Simkl diary is a pure projection of the
 * library snapshot — one flatten, no extra endpoint, and the query layer
 * caches it under the same `allItemsRoot` invalidation prefix every other
 * snapshot consumer refetches on (the rate-limit discipline in
 * docs/solutions/simkl-rate-limits-and-write-lock.md: never a new polled
 * read when the snapshot already carries the data).
 */

/**
 * How many entries the projection exposes, newest-first. A long-lived Simkl
 * library carries thousands of per-episode instants in one snapshot, while
 * every other diary provider contributes at most `MAX_PAGES × PAGE_SIZE`
 * (250) entries per window — an unbounded flatten would make Simkl dominate
 * the merge's memory and sort cost. 500 (double the sibling window) keeps
 * scroll-back deep without letting the snapshot dwarf the paginated legs;
 * past it the Simkl leg simply exhausts, exactly like Letterboxd's single
 * RSS window.
 */
const SIMKL_DIARY_WINDOW = 500;

/** Ordering key — Simkl instants are ISO-with-Z; unparseable sinks last. */
function entryMs(entry: NormalizedDiaryEntry): number {
  const ms = Date.parse(entry.watchedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * One diary entry per watched episode carrying an instant (plan 0016: a diary
 * entry is a *log*). Episodes Simkl marked watched without recording an
 * instant are skipped — they cannot be placed on a timeline, and inventing a
 * date from `last_watched_at` would dump a whole backfilled season onto one
 * day. `includeSeason` is false for anime: Simkl numbers anime absolutely
 * (AniDB convention), so "Ep 5" is the truthful detail line, matching how
 * AniList's leg renders the same log — not "S1E5".
 */
function episodeEntries(
  entry: SimklLibraryEntry,
  includeSeason: boolean,
): NormalizedDiaryEntry[] {
  const entries: NormalizedDiaryEntry[] = [];
  for (const episode of entry.watchedEpisodes) {
    if (episode.watchedAt == null) continue;
    entries.push({
      // `item.id` is already `simkl-${simklId}` — the suffix makes the log id
      // stable per (item, episode), the `${provider}-${nativeLogId}` contract.
      id: `${entry.item.id}-s${episode.season}e${episode.number}`,
      provider,
      watchedAt: episode.watchedAt,
      item: entry.item,
      episodes: [episode.number],
      ...(includeSeason ? { season: episode.season } : {}),
    });
  }
  return entries;
}

/**
 * A movie (or anime film — Simkl files those under its anime catalog, flagged
 * `isFilm`) is one play, dated by `last_watched_at` — or, for a film whose
 * "episode 1" carries the instant instead, that episode's `watchedAt`. No
 * instant → no entry: Simkl records only the latest play, and an undated one
 * has no diary day to land on.
 */
function playEntry(entry: SimklLibraryEntry): NormalizedDiaryEntry | undefined {
  const watchedAt =
    entry.lastWatchedAt ??
    entry.watchedEpisodes.find((episode) => episode.watchedAt != null)?.watchedAt;
  if (watchedAt == null) return undefined;
  return { id: entry.item.id, provider, watchedAt, item: entry.item };
}

/**
 * The pure snapshot → diary projection: shows and anime flatten to per-episode
 * logs, movies and anime films to single plays, newest-first, capped at
 * `SIMKL_DIARY_WINDOW`. No Effect, no React — unit-tested here, exactly like
 * `features/diary/merge.ts` downstream of it.
 */
export function simklDiaryEntries(library: SimklLibrary): NormalizedDiaryEntry[] {
  const entries: NormalizedDiaryEntry[] = [];
  for (const entry of library.shows) {
    entries.push(...episodeEntries(entry, true));
  }
  for (const entry of library.anime) {
    if (entry.item.isFilm === true) {
      const play = playEntry(entry);
      if (play != null) entries.push(play);
    } else {
      entries.push(...episodeEntries(entry, false));
    }
  }
  for (const entry of library.movies) {
    const play = playEntry(entry);
    if (play != null) entries.push(play);
  }
  return entries
    .sort((a, b) => entryMs(b) - entryMs(a))
    .slice(0, SIMKL_DIARY_WINDOW);
}

/**
 * The diary read (plan 0016 diary contract, Simkl leg): the whole unfiltered
 * snapshot in one authorized GET, projected to `NormalizedDiaryEntry[]`. A
 * single window, not a cursor — the queryFn wiring gives it
 * `getNextPageParam: () => undefined` so it exhausts after page 1 and drops
 * out of the diary watermark early, the Letterboxd RSS precedent.
 */
export function getSimklDiary(
  deps: SimklDeps,
): Effect.Effect<NormalizedDiaryEntry[], ProviderError> {
  return getAllItems(deps, {}).pipe(Effect.map(simklDiaryEntries));
}
