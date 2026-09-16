import { View } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CreditTimelineSkeleton } from '@/features/credit-timeline/credit-timeline';
import { cn } from '@/lib/cn';

/** The person hero on the person screen's geometry, so content lands without a shift. */
export function PersonSkeleton() {
  return (
    <CreditTimelineSkeleton
      header={
        <View className="px-6 pt-28">
          <View className="flex-row items-center gap-5 mb-6">
            <Skeleton className="w-28 h-28 rounded-full" delay={staggerDelay(0)} />
            <View className="flex-1">
              <Skeleton className="h-8 w-48 rounded" delay={staggerDelay(1)} />
              <Skeleton className="h-3.5 w-40 rounded mt-2.5" delay={staggerDelay(1)} />
            </View>
          </View>
          {/* The bio's four clamped lines on their 26px pitch, then "Read
              more" and the `ExpandableText` margin under it. */}
          <View className="max-w-xl mb-6">
            {['w-full', 'w-full', 'w-full', 'w-2/3'].map((width, line) => (
              <Skeleton
                className={cn('h-4 rounded', width, line > 0 && 'mt-2.5')}
                delay={staggerDelay(2)}
                key={line}
              />
            ))}
            <Skeleton className="h-3.5 w-20 rounded mt-4" delay={staggerDelay(2)} />
          </View>
        </View>
      }
      roles
    />
  );
}
