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
 *
 * Every record must be compared **in its own numbering domain** (plan 0027
 * KTD5): Trakt and Serializd against canonical `${season}-${number}` keys,
 * AniList against the entry's own 1..n progress. `useLogMedia` picks the domain
 * per provider before calling in here — a season-2 intent compared against
 * season-1 keys is the false in-sync skip this plan removes. Providers whose
 * canonical mapping couldn't be resolved never reach these records at all:
 * they are reasoned skips, and including them would make a genuine parity
 * rewatch look like a catch-up.
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
 * count as "already recorded". `episodes` is always the **canonical** batch —
 * for an AniList-origin log that is the ani.zip-translated one, never the
 * entry's own numbering (plan 0027 R4).
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
 * AniList's own domain (plan 0027 KTD5): `entryNumbers` are the entry's
 * relative 1..n episodes — the same scalar its `progress` counts — so a sequel
 * entry's episode 3 compares against progress 3 no matter which canonical
 * season Trakt received. A COMPLETED entry has every episode of *that entry*.
 */
export function anilistHasEpisodes(
  entry: AniListEntrySnapshot | null,
  entryNumbers: readonly number[],
): boolean {
  if (entry == null) return false;
  if (entry.status === 'COMPLETED') return true;
  if (entryNumbers.length === 0) return false;
  return entry.progress >= Math.max(...entryNumbers);
}
