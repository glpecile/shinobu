import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * A titled page section. `count` sits beside the title (a string, or a
 * skeleton while it loads); `subtitle` sits under it. `className` is layout only.
 */
export function Section({
  title,
  count,
  subtitle,
  className,
  children,
}: {
  title: string;
  count?: ReactNode;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn('mt-8', className)}>
      <View className="mb-4">
        <View className="flex-row items-baseline gap-2">
          <Text className="font-display text-xl text-foreground">{title}</Text>
          {typeof count === 'string' ? (
            <Text className="text-muted font-sans text-xs">{count}</Text>
          ) : (
            count
          )}
        </View>
        {subtitle != null && (
          <Text className="text-muted font-sans text-sm mt-1">{subtitle}</Text>
        )}
      </View>
      {children}
    </View>
  );
}
