import { View } from 'react-native';

import { RailHead } from '@/components/rail-head';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { useWallMetrics } from '@/features/media-layout/poster-wall';
import { useWatchlistView } from '@/state/prefs/watchlist-view';

function GridSkeleton({
  animated,
  count,
  offset = 0,
}: {
  animated: boolean;
  count: number;
  offset?: number;
}) {
  const { columns } = useWallMetrics();
  return (
    <View className="flex-row flex-wrap px-2">
      {Array.from({ length: count }).map((_, index) => (
        <View className="p-1" key={index} style={{ width: `${100 / columns}%` }}>
          <Skeleton
            animated={animated}
            className="w-full aspect-2/3 rounded-lg"
            delay={staggerDelay(offset + index)}
          />
        </View>
      ))}
    </View>
  );
}

function RowsSkeleton({
  animated,
  count,
  offset = 0,
}: {
  animated: boolean;
  count: number;
  offset?: number;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View className="flex-row items-center px-6 py-2.5" key={index}>
          <Skeleton
            animated={animated}
            className="w-12 h-18 rounded"
            delay={staggerDelay(offset + index)}
          />
          <View className="ml-4 gap-2">
            <Skeleton
              animated={animated}
              className="h-4 w-44 rounded-full"
              delay={staggerDelay(offset + index)}
            />
            <Skeleton
              animated={animated}
              className="h-3 w-24 rounded-full"
              delay={staggerDelay(offset + index)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function WallSkeleton({ animated = true }: { animated?: boolean }) {
  const { columns } = useWallMetrics();
  return useWatchlistView() === 'grid' ? (
    <View className="pt-1">
      <GridSkeleton animated={animated} count={columns * 2} />
    </View>
  ) : (
    <RowsSkeleton animated={animated} count={8} />
  );
}

export function ShelvesSkeleton({ animated = true }: { animated?: boolean }) {
  const { columns } = useWallMetrics();
  const grid = useWatchlistView() === 'grid';
  const shelf = grid ? Math.min(2, columns) : 2;
  return (
    <View className="pt-1">
      <RailHead.Skeleton animated={animated} lead="icon" showRail={false} />
      {grid ? (
        <GridSkeleton animated={animated} count={shelf} />
      ) : (
        <RowsSkeleton animated={animated} count={shelf} />
      )}
      <RailHead.Skeleton animated={animated} lead="icon" showRail={false} />
      {grid ? (
        <GridSkeleton animated={animated} count={columns * 2} offset={shelf} />
      ) : (
        <RowsSkeleton animated={animated} count={6} offset={shelf} />
      )}
    </View>
  );
}
