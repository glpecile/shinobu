import { hasAired } from '@/lib/time/has-aired';
import type { NormalizedEpisode, NormalizedSeason } from '@/types/media';

export type SeasonRow =
  | { kind: 'season'; key: string; season: NormalizedSeason; open: boolean }
  | { kind: 'mark'; key: string; season: NormalizedSeason }
  | { kind: 'episode'; key: string; season: NormalizedSeason; episode: NormalizedEpisode; last: boolean };

/** Closed seasons contribute only their header; expanded episodes remain individual list cells. */
export function seasonRows(seasons: readonly NormalizedSeason[], expanded: ReadonlySet<number>): SeasonRow[] {
  const rows: SeasonRow[] = [];
  for (const season of seasons) {
    const open = expanded.has(season.number);
    rows.push({ kind: 'season', key: `season-${season.number}`, season, open });
    if (!open) continue;
    if (season.episodes.some((episode) => hasAired(episode.firstAired))) {
      rows.push({ kind: 'mark', key: `mark-${season.number}`, season });
    }
    season.episodes.forEach((episode, index) => {
      rows.push({
        kind: 'episode',
        key: `episode-${season.number}-${episode.number}`,
        season,
        episode,
        last: index === season.episodes.length - 1,
      });
    });
  }
  return rows;
}
