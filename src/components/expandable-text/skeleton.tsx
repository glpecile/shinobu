import { View } from 'react-native';

import { Skeleton, staggerDelay } from '@/components/skeleton';
import { cn } from '@/lib/cn';

/**
 * The card's own placeholder: title row, then `lines` bars on the body's
 * 26px pitch (`text-base leading-relaxed`), with the `mb-6` the card carries.
 */
export function ExpandableTextSkeleton({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'bg-surface border border-border rounded-lg px-4 py-3 mb-6',
        className,
      )}
    >
      <View className="flex-row items-center justify-between h-6 mb-1.5">
        <Skeleton className="h-4 w-24 rounded" delay={staggerDelay(2)} />
        <Skeleton className="h-4 w-4 rounded" delay={staggerDelay(2)} />
      </View>
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton
          className={cn(
            'h-4 rounded',
            line === lines - 1 ? 'w-2/3' : 'w-full',
            line === 0 ? 'mt-1' : 'mt-2.5',
            line === lines - 1 && 'mb-1.5',
          )}
          delay={staggerDelay(2)}
          key={line}
        />
      ))}
    </View>
  );
}
