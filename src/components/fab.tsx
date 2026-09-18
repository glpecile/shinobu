import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor } from '@/lib/theme-color';

const SIZE = {
  sm: { box: 'w-11 h-11', icon: 20 },
  md: { box: 'w-14 h-14', icon: 24 },
};

/**
 * The accent circle floating in a screen's corner. The caller positions it
 * through `className`. Not a `Button`: that is a labelled pill, like
 * `RoundIconButton`'s reason for being its own pressable.
 *
 * Keeps a ripple so Android's keyboard focus draws a circle
 * (docs/solutions/android-ripple-ignores-child-radius.md).
 */
export function Fab({
  icon,
  label,
  hint,
  onPress,
  size = 'md',
  className,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  onPress: () => void;
  size?: keyof typeof SIZE;
  /** Layout only. */
  className?: string;
}) {
  const accentForeground = useThemeColor('--color-accent-foreground');
  return (
    <PresstableOpacity
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      className={cn(
        SIZE[size].box,
        'rounded-full bg-accent items-center justify-center',
        className,
      )}
      onPress={onPress}
      // 3D is 24% alpha, the tab bar's ripple strength. Android only.
      rippleColor={`${accentForeground}3D`}
    >
      <Ionicons color={accentForeground} name={icon} size={SIZE[size].icon} />
    </PresstableOpacity>
  );
}
