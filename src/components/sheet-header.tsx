import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';

/**
 * What a long-press sheet is about: artwork (`leading`) beside an optional
 * accent eyebrow, the title, and one muted line. The title wraps past the
 * clamp that made the sheet worth opening.
 */
export function SheetHeader({
  leading,
  eyebrow,
  title,
  subtitle,
}: {
  leading?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="flex-row items-center gap-4">
      {leading}
      <View className="flex-1">
        {eyebrow != null && <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
        <Text className="text-2xl font-display text-foreground" numberOfLines={3}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-muted font-sans text-sm mt-1">{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}
