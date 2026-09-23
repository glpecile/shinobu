import { View } from 'react-native';

import { useFloatingBackButtonClearance } from '@/components/floating-back-button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CreditTimelineSkeleton } from '@/features/credit-timeline/credit-timeline';

/** The studio hero on the studio screen's geometry: a square logo tile, no bio. */
export function StudioSkeleton() {
  const headerTop = useFloatingBackButtonClearance();
  return (
    <CreditTimelineSkeleton
      header={
        <View className="px-6 pb-6" style={{ paddingTop: headerTop }}>
          <View className="flex-row items-center gap-5">
            <Skeleton className="w-28 h-28 rounded-lg" delay={staggerDelay(0)} />
            <View className="flex-1">
              <Skeleton className="h-8 w-48 rounded" delay={staggerDelay(1)} />
              <Skeleton className="h-3.5 w-32 rounded mt-2.5" delay={staggerDelay(1)} />
            </View>
          </View>
        </View>
      }
    />
  );
}
