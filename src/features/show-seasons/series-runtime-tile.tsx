import { Skeleton } from '@/components/skeleton';
import { StatTile } from '@/components/stat-tile';
import { useShowSeasonsQuery, useShowSeasonsSource } from '@/state/queries/show-seasons';
import type { NormalizedMediaItem } from '@/types/media';
import { formatRuntime, seriesRuntimeMinutes } from './runtime';

export function SeriesRuntimeTile({ item }: { item: NormalizedMediaItem }) {
  const source = useShowSeasonsSource(item);
  const { data: seasons, isLoading } = useShowSeasonsQuery(source);

  if (source == null) return null;
  if (seasons == null) {
    return (
      <StatTile
        label="Total time"
        value={isLoading ? <Skeleton className="h-7 w-16 rounded mt-1" /> : '—'}
      />
    );
  }

  const episodeRuntime =
    item.runtime ??
    seasons.flatMap((season) => season.episodes).find((episode) => episode.runtime != null)
      ?.runtime;

  return (
    <StatTile
      label="Total time"
      value={formatRuntime(seriesRuntimeMinutes(seasons))}
      {...(episodeRuntime != null ? { caption: `${episodeRuntime}m each` } : {})}
    />
  );
}
