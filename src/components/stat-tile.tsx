import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Eyebrow } from '@/components/eyebrow';
import { MorphText } from '@/components/morph-text';

export function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
}) {
  return (
    <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
      <Eyebrow>{label}</Eyebrow>
      {typeof value === 'string' || typeof value === 'number' ? (
        <MorphText className="text-foreground text-2xl font-sans-semibold tabular-nums mt-0.5 self-start">
          {value}
        </MorphText>
      ) : (
        value
      )}
      {caption != null && (
        <Text className="text-sm text-muted font-sans">{caption}</Text>
      )}
    </View>
  );
}
