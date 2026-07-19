import { View } from 'react-native';

import { Skeleton } from '@/components/skeleton';

/** Mirrors the person screen layout so content lands without a shift. */
export function PersonSkeleton() {
  return (
    <View className="w-full max-w-4xl self-center pt-28">
      <View className="px-6">
        <View className="flex-row items-center gap-5 mb-6">
          <Skeleton className="w-28 h-28 rounded-full" />
          <View className="flex-1">
            <Skeleton className="h-8 w-48 rounded" />
            <Skeleton className="h-3 w-40 rounded mt-2" />
          </View>
        </View>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded mt-2 mb-8" />
      </View>
      <View className="px-6">
        <Skeleton className="h-6 w-24 rounded mb-3" />
        {/* Enough cards to overflow any viewport up to the max-w-4xl container;
            overflow-hidden clips the excess, reading as an off-screen carousel. */}
        <View className="flex-row overflow-hidden gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton className="w-40 h-60 rounded-card" key={index} />
          ))}
        </View>
      </View>
    </View>
  );
}
