import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import { cn } from '@/lib/cn';

/** Inner View holds the border because pressto never draws borders on Android (docs/solutions/pressto-border-not-drawn-on-android.md). */
export function PressableCard({
  children,
  className,
  cardClassName,
  padded = true,
  ...rest
}: Omit<ComponentProps<typeof PresstableScale>, 'minScale' | 'children'> & {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  padded?: boolean;
}) {
  return (
    <PresstableScale className={cn('rounded-lg', className)} minScale={0.99} {...rest}>
      <View
        className={cn(
          'bg-surface border border-border rounded-lg',
          padded && 'px-4 py-3',
          cardClassName,
        )}
      >
        {children}
      </View>
    </PresstableScale>
  );
}
