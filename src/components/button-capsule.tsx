import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * An outlined pill around ghost `Button`s, so icon actions read as one control.
 * Beside a labelled md `Button` it lines up as that button's extension: a 44px
 * icon button, `p-0.5`, and the border make the same 50px. `floating` is the
 * surfaced, shadowed version that hovers over content (the episode pager).
 */
export function ButtonCapsule({ floating = false, className, children }: {
  floating?: boolean;
  /** Layout only. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn('flex-row items-center rounded-full border border-border', floating ? 'p-1 bg-surface shadow-md' : 'p-0.5', className)}>
      {children}
    </View>
  );
}
