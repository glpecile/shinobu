import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * The cross-provider sync rule (plan 0011 decision 7), pure for testing:
 *
 * - Some provider is missing the watch → write only to the missing ones
 *   (catch-up); providers that already have it are *skipped*, never
 *   double-logged.
 * - Every provider already has it (parity) → this log is a rewatch, written
 *   to all of them.
 */

export type LogAction = 'log' | 'skip' | 'rewatch';

export interface ProviderWatchRecord {
  provider: ProviderId;
  /** Whether this provider already records the intended watch. */
  hasIt: boolean;
}

export interface LogDecision {
  provider: ProviderId;
  action: LogAction;
}

export function reconcileLogTargets(
  records: readonly ProviderWatchRecord[],
): LogDecision[] {
  const anyMissing = records.some((record) => !record.hasIt);
  return records.map((record) => ({
    provider: record.provider,
    action: anyMissing ? (record.hasIt ? 'skip' : 'log') : 'rewatch',
  }));
}

/* --- Per-provider "does it already have this watch?" helpers. ------------ */

/** Trakt watched-movies match: any shared id counts (enriched items may lack the trakt id). */
export function traktHasFilm(
  watchedMovies: readonly NormalizedMediaItem[],
  item: NormalizedMediaItem,
): boolean {
  const { trakt, tmdb, imdb } = item.externalIds;
  return watchedMovies.some((watched) => {
    const ids = watched.externalIds;
    return (
      (trakt != null && ids.trakt === trakt) ||
      (tmdb != null && ids.tmdb === tmdb) ||
      (imdb != null && ids.imdb === imdb)
    );
  });
}

/**
 * Trakt show progress (`normalizeWatchedProgress`'s `"season-number"` key
 * set): the intended episodes all have to be completed for the batch to
 * count as "already recorded".
 */
export function traktHasEpisodes(
  completedKeys: ReadonlySet<string>,
  episodes: readonly { season: number; number: number }[],
): boolean {
  return episodes.every((episode) =>
    completedKeys.has(`${episode.season}-${episode.number}`),
  );
}

export interface AniListEntrySnapshot {
  status: string | null;
  progress: number;
}

/** A completed (or re-watching) AniList entry records the film. */
export function anilistHasFilm(entry: AniListEntrySnapshot | null): boolean {
  return entry != null && (entry.status === 'COMPLETED' || entry.status === 'REPEATING');
}

/**
 * Single-season scope (plan 0011): AniList entry progress ≡ season-1 episode
 * number, and a COMPLETED entry has every episode.
 */
export function anilistHasEpisodes(
  entry: AniListEntrySnapshot | null,
  episodes: readonly { season: number; number: number }[],
): boolean {
  if (entry == null) return false;
  if (entry.status === 'COMPLETED') return true;
  const highest = Math.max(...episodes.map((episode) => episode.number));
  return entry.progress >= highest;
}
