import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';

/**
 * The 40px round glyph floating over content — back, close, the sidebar
 * toggle. Not a `Button`: that is a labelled pill, and this has no label to
 * draw, a translucent fill, and callers that bring non-Ionicons glyphs.
 *
 * The box sits on an inner View because a border on the pressable itself is
 * never drawn on Android (docs/solutions/pressto-border-not-drawn-on-android.md).
 */
export function RoundIconButton({
  icon,
  label,
  onPress,
  className,
  style,
}: {
  icon: ReactNode;
  /** Announced, not drawn. */
  label: string;
  onPress: () => void;
  /** Layout only. */
  className?: string;
  style?: ComponentProps<typeof PresstableOpacity>['style'];
}) {
  return (
    <PresstableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      className={cn('rounded-full', className)}
      onPress={onPress}
      style={style}
    >
      <View className="w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center">
        {icon}
      </View>
    </PresstableOpacity>
  );
}
