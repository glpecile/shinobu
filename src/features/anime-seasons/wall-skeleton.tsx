import { View } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { useWallMetrics } from '@/features/watchlist/poster-wall';
import { useWatchlistView } from '@/state/prefs/watchlist-view';

/** Two rows of pulsing posters in the wall's own column count. */
function GridSkeleton() {
  const { columns } = useWallMetrics();
  return (
    <View className="flex-row flex-wrap px-2 pt-1">
      {Array.from({ length: columns * 2 }).map((_, index) => (
        <View
          className="p-1"
          key={index}
          style={{ width: `${100 / columns}%`, aspectRatio: 2 / 3 }}
        >
          <Skeleton className="w-full h-full rounded-md" delay={staggerDelay(index)} />
        </View>
      ))}
    </View>
  );
}

/** A screen of list rows in `WatchlistRows`' geometry: 48×72 poster, title, detail line. */
function RowsSkeleton() {
  return (
    <View>
      {Array.from({ length: 8 }).map((_, index) => (
        <View className="flex-row items-center px-6 py-2.5" key={index}>
          <Skeleton className="w-12 h-[72px] rounded" delay={staggerDelay(index)} />
          <View className="ml-4 gap-2">
            <Skeleton className="h-4 w-44 rounded" delay={staggerDelay(index)} />
            <Skeleton className="h-3 w-24 rounded" delay={staggerDelay(index)} />
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
export function WallSkeleton() {
  return useWatchlistView() === 'grid' ? <GridSkeleton /> : <RowsSkeleton />;
}
