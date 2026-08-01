import { Skeleton } from '@/components/skeleton';
import { StatTile } from '@/components/stat-tile';
import {
  useShowSeasonsQuery,
  useShowSeasonsSource,
} from '@/state/queries/show-seasons';
import type { NormalizedMediaItem } from '@/types/media';
import { formatRuntime, seriesRuntimeMinutes } from './runtime';

/**
 * TV-only stat tile shown next to Progress/Total (plan 0010): the complete
 * series runtime, summed from the seasons structure. Shares the seasons query
 * cache with the suspense `SeasonsSection` — no second fetch — so it renders a
 * skeleton until that data lands, then fills in the accurate total. Absent any
 * seasons source (no Trakt credentials and no TMDB token) it renders nothing.
 */
export function SeriesRuntimeTile({ item }: { item: NormalizedMediaItem }) {
  // Hooks must run unconditionally (React's rules-of-hooks): the query hook
  // accepts a null source (disabled, never fetches) and the no-source case
  // renders nothing after the hooks return.
  const source = useShowSeasonsSource(item);
  const { data: seasons, isLoading } = useShowSeasonsQuery(source);

  if (source == null) return null;
  if (seasons == null) {
    return (
      <StatTile
        label="Total time"
        value={
          isLoading ? <Skeleton className="h-7 w-16 rounded mt-1" /> : '—'
        }
      />
    );
  }

  const episodeRuntime =
    item.runtime ?? seasons.flatMap((season) => season.episodes).find(
      (episode) => episode.runtime != null,
    )?.runtime;

  return (
    <StatTile
      label="Total time"
      value={formatRuntime(seriesRuntimeMinutes(seasons))}
      {...(episodeRuntime != null
        ? { caption: `${episodeRuntime}m each` }
        : {})}
    />
  );
}
