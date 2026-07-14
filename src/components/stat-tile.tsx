import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * One stat tile of the detail screen's row (Progress / Total / Total time) —
 * a single shell so Trakt- and AniList-sourced pages render identical tiles.
 * Value and caption are deliberately stacked (not inline): the tiles are too
 * narrow for "22 episodes" on one line, and an inline wrap leaves a full 2xl
 * line-height gap above the unit.
 */
export function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  /** Preformatted number/duration, or a skeleton while it loads. */
  value: ReactNode;
  caption?: string;
}) {
  return (
    <View className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
      <Text className="text-muted text-xs font-sans uppercase">{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text className="text-foreground text-2xl font-sans-semibold mt-0.5">
          {value}
        </Text>
      ) : (
        value
      )}
      {caption != null && (
        <Text className="text-sm text-muted font-sans">{caption}</Text>
      )}
    </View>
  );
}
