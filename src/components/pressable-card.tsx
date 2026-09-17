import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import { cn } from '@/lib/cn';

/**
 * A bordered surface card that presses as one thing: a hair of scale, border
 * included. The card is an inner View, not the pressable itself, because a
 * border on the pressable is never drawn on Android
 * (docs/solutions/pressto-border-not-drawn-on-android.md).
 */
export function PressableCard({
  children,
  className,
  cardClassName,
  ...rest
}: Omit<ComponentProps<typeof PresstableScale>, 'minScale' | 'children'> & {
  children: ReactNode;
  /** Layout only. */
  className?: string;
  /** The card's own box — its content direction, a corner squared off. */
  cardClassName?: string;
}) {
  return (
    <PresstableScale className={cn('rounded-lg', className)} minScale={0.99} {...rest}>
      <View
        className={cn(
          'bg-surface border border-border rounded-lg px-4 py-3',
          cardClassName,
        )}
      >
        {children}
      </View>
    </PresstableScale>
  );
}
