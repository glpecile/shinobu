import { Text, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { useTraktShowSeasonsQuery } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';
import { formatRuntime, seriesRuntimeMinutes } from './runtime';

/**
 * TV-only stat tile shown next to Progress/Total (plan 0010): the complete
 * series runtime, summed from the seasons structure. Shares the seasons query
 * cache with the suspense `SeasonsSection` — no second fetch — so it renders a
 * skeleton until that data lands, then fills in the accurate total. Absent the
 * trakt id (e.g. an AniList-only anime series) it renders nothing.
 */
export function SeriesRuntimeTile({ item }: { item: NormalizedMediaItem }) {
  const traktId = item.externalIds.trakt;
  // Hooks must run unconditionally (React's rules-of-hooks): keep the query
  // mounted with a sentinel id when there's no trakt id, then render nothing
  // for that case after the hooks return. Disabled so it never fetches.
  const { data: seasons, isLoading } = useTraktShowSeasonsQuery({
    traktId: traktId ?? -1,
    enabled: traktId != null,
  });

  if (traktId == null) return null;
  if (seasons == null) {
    return (
      <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
        <Text className="text-muted text-xs font-sans uppercase">Total time</Text>
        {isLoading ? (
          <Skeleton className="h-7 w-16 rounded mt-1" />
        ) : (
          <Text className="text-foreground text-2xl font-sans-semibold mt-0.5">—</Text>
        )}
      </View>
    );
  }

  const episodeRuntime =
    item.runtime ?? seasons.flatMap((season) => season.episodes).find(
      (episode) => episode.runtime != null,
    )?.runtime;

  return (
    <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
      <Text className="text-muted text-xs font-sans uppercase">Total time</Text>
      <Text className="text-foreground text-2xl font-sans-semibold mt-0.5">
        {formatRuntime(seriesRuntimeMinutes(seasons))}
      </Text>
      {episodeRuntime != null && (
        <Text className="text-sm text-muted font-sans">
          {episodeRuntime}m each
        </Text>
      )}
    </View>
  );
}
