import { View } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CreditTimelineSkeleton } from '@/features/credit-timeline/credit-timeline';

/** Mirrors the person (and studio) screen layout so content lands without a shift. */
export function PersonSkeleton() {
  return (
    <View className="w-full max-w-4xl self-center pt-28">
      <View className="px-6">
        <View className="flex-row items-center gap-5 mb-6">
          <Skeleton className="w-28 h-28 rounded-full" delay={staggerDelay(0)} />
          <View className="flex-1">
            <Skeleton className="h-8 w-48 rounded" delay={staggerDelay(1)} />
            <Skeleton className="h-3 w-40 rounded mt-2" delay={staggerDelay(1)} />
          </View>
        </View>
        <View className="max-w-xl">
          <Skeleton className="h-4 w-full rounded" delay={staggerDelay(2)} />
          <Skeleton className="h-4 w-2/3 rounded mt-2" delay={staggerDelay(2)} />
        </View>
      </View>
      <CreditTimelineSkeleton />
    </View>
  );
}
