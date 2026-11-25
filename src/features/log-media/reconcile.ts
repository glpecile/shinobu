import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';

export type LogAction = 'log' | 'skip' | 'rewatch';

export interface ProviderWatchRecord {
  provider: ProviderId;
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

export function anilistHasFilm(entry: AniListEntrySnapshot | null): boolean {
  return entry != null && (entry.status === 'COMPLETED' || entry.status === 'REPEATING');
}

export function anilistHasEpisodes(
  entry: AniListEntrySnapshot | null,
  entryNumbers: readonly number[],
): boolean {
  if (entry == null) return false;
  if (entry.status === 'COMPLETED') return true;
  if (entryNumbers.length === 0) return false;
  return entry.progress >= Math.max(...entryNumbers);
}
