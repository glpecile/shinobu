import { Text, View } from 'react-native';

import type { BadgeTone } from '@/features/up-next/badges';

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
      className={`rounded-sm px-1.5 py-0.5 ${
        accent ? 'bg-accent' : 'bg-black/60 border border-border/60'
      }`}
    >
      {/* Both tones sit on artwork, so both take the on-accent (always light)
          foreground — `text-foreground` would vanish into the scrim in the
          light theme, where it is near-black. */}
      <Text className="font-sans text-xs text-accent-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
