import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';

/** Inner View holds the border because pressto never draws borders on Android (docs/solutions/pressto-border-not-drawn-on-android.md). */
export function RoundIconButton({
  icon,
  label,
  onPress,
  className,
  style,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  className?: string;
  style?: ComponentProps<typeof PresstableOpacity>['style'];
}) {
  return (
    <PresstableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      className={cn('min-w-11 min-h-11 items-center justify-center rounded-full', className)}
      onPress={onPress}
      style={style}
    >
      <View className="w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center">
        {icon}
      </View>
    </PresstableOpacity>
  );
}
