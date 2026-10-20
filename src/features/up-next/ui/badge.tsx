import { Text, View } from 'react-native';

import type { BadgeTone } from '@/features/up-next/badges';
import { cn } from '@/lib/cn';

/**
 * The small pill on an Up Next card — runtime, "New", or a relative-day label
 * (plan 0019 U5). Feature-local on purpose: it stays here until a second
 * feature needs the same thing, at which point it graduates to components/.
 */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
}) {
  const accent = tone === 'accent';
  return (
    <View
      className={cn(
        'shrink-0 max-w-full rounded-sm px-1.5 py-0.5',
        accent ? 'bg-accent-tonal' : 'bg-black/60 border border-border/60',
      )}
    >
      {/* The neutral badge sits on a dark artwork scrim in either theme. */}
      <Text className={cn('font-sans text-xs', accent ? 'text-accent-on-tonal' : 'text-accent-foreground')} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
