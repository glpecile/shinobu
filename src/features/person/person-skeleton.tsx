import { View } from 'react-native';

import { ExpandableText } from '@/components/expandable-text';
import { useFloatingBackButtonClearance } from '@/components/floating-back-button';
import { Skeleton, staggerDelay } from '@/components/skeleton';
import { CreditTimelineSkeleton } from '@/features/credit-timeline/credit-timeline';

/** The person hero on the person screen's geometry, so content lands without a shift. */
export function PersonSkeleton() {
  const headerTop = useFloatingBackButtonClearance();
  return (
    <CreditTimelineSkeleton
      header={
        <View className="px-6" style={{ paddingTop: headerTop }}>
          <View className="flex-row items-center gap-5 mb-6">
            <Skeleton className="w-28 h-28 rounded-full" delay={staggerDelay(0)} />
            <View className="flex-1">
              <Skeleton className="h-9 w-48 max-w-full rounded" delay={staggerDelay(1)} />
              <Skeleton className="h-5 w-40 max-w-full rounded mt-1.5" delay={staggerDelay(1)} />
            </View>
          </View>
          <ExpandableText.Skeleton className="min-h-40" lines={4} />
        </View>
      }
      roles
    />
  );
}
