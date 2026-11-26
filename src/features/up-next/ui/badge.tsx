import { Text, View } from 'react-native';

import type { BadgeTone } from '@/features/up-next/badges';
import { cn } from '@/lib/cn';

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
        'shrink-0 max-w-full rounded px-1.5 py-0.5',
        accent ? 'bg-accent-tonal' : 'bg-black/60 border border-border/60',
      )}
    >
      <Text className={cn('font-sans text-xs', accent ? 'text-accent-on-tonal' : 'text-accent-foreground')} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
