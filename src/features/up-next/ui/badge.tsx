import { Text, View } from 'react-native';

import type { BadgeTone } from '@/features/up-next/badges';
import { cn } from '@/lib/cn';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const accent = tone === 'accent';
  return (
    <View
      className={cn(
        'shrink-0 max-w-full rounded px-1.5 py-0.5',
        accent ? 'bg-accent-tonal' : 'bg-scrim border border-hairline',
      )}
    >
      <Text
        className={cn(
          'font-sans text-xs tabular-nums',
          accent ? 'text-accent-on-tonal' : 'text-on-scrim',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
