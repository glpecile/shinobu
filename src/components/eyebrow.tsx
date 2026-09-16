import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { cn } from '@/lib/cn';

/** Small uppercase label over or beside a title. `className` is layout only. */
export function Eyebrow({
  tone = 'muted',
  className,
  numberOfLines,
  children,
}: {
  tone?: 'muted' | 'accent';
  className?: string;
  numberOfLines?: number;
  children: ReactNode;
}) {
  return (
    <Text
      className={cn(
        'font-sans-semibold text-xs uppercase tracking-wider',
        tone === 'accent' ? 'text-accent' : 'text-muted',
        className,
      )}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}
