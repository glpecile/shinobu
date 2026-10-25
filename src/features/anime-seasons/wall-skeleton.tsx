import { View } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { useWallMetrics } from '@/features/media-layout/poster-wall';
import { useWatchlistView } from '@/state/prefs/watchlist-view';

/** Two rows of pulsing posters in the wall's own column count. */
function GridSkeleton({ animated }: { animated: boolean }) {
  const { columns } = useWallMetrics();
  return (
    <View className="flex-row flex-wrap px-2 pt-1">
      {Array.from({ length: columns * 2 }).map((_, index) => (
        <View
          className="p-1"
          key={index}
          style={{ width: `${100 / columns}%` }}
        >
          <Skeleton animated={animated} className="w-full aspect-2/3 rounded-md" delay={staggerDelay(index)} />
        </View>
      ))}
    </View>
  );
}

/** A screen of list rows in `WatchlistRows`' geometry: 48×72 poster, title, detail line. */
function RowsSkeleton({ animated }: { animated: boolean }) {
  return (
    <View>
      {Array.from({ length: 8 }).map((_, index) => (
        <View className="flex-row items-center px-6 py-2.5" key={index}>
          <Skeleton animated={animated} className="w-12 h-18 rounded" delay={staggerDelay(index)} />
          <View className="ml-4 gap-2">
            <Skeleton animated={animated} className="h-4 w-44 rounded-full" delay={staggerDelay(index)} />
            <Skeleton animated={animated} className="h-3 w-24 rounded-full" delay={staggerDelay(index)} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The wall's loading state in the shape the wall will take — the grid/list
 * preference is read synchronously from MMKV, so the skeleton already knows
 * which layout is coming and the load reads as that layout materializing,
 * not as a grid that then turns into a list.
 */
export function WallSkeleton({ animated = true }: { animated?: boolean }) {
  return useWatchlistView() === 'grid' ? <GridSkeleton animated={animated} /> : <RowsSkeleton animated={animated} />;
}
