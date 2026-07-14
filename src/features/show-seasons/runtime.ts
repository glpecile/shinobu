import type { NormalizedSeason } from '@/types/media';

/** Sum of episode runtimes across a season, in minutes (absent runtimes skip). */
export function seasonRuntimeMinutes(season: NormalizedSeason): number {
  return season.episodes.reduce((sum, episode) => sum + (episode.runtime ?? 0), 0);
}

/** Sum of every season's episode runtimes, in minutes. */
export function seriesRuntimeMinutes(seasons: readonly NormalizedSeason[]): number {
  return seasons.reduce((sum, season) => sum + seasonRuntimeMinutes(season), 0);
}

/**
 * Formats a minute total compactly: "1d 3h", "2h 15m", "45m". Days surface
 * only past 24h so short shows read naturally. Zero or negative → "—".
 */
export function formatRuntime(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '—';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}