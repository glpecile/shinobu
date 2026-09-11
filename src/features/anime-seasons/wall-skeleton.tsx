import { View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { useWallMetrics } from '@/features/watchlist/poster-wall';

/** Two rows of pulsing posters in the wall's own column count — the first load
 *  reads as the wall materializing, not as a notice that then gets replaced. */
export function WallSkeleton() {
  const { columns } = useWallMetrics();
  return (
    <View className="flex-row flex-wrap px-2 pt-1">
      {Array.from({ length: columns * 2 }).map((_, index) => (
        <View
          className="p-1"
          key={index}
          style={{ width: `${100 / columns}%`, aspectRatio: 2 / 3 }}
        >
          <Skeleton className="w-full h-full rounded-md" />
        </View>
      ))}
    </View>
  );
}
