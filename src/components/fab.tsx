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
 * through `className`.
 *
 * It keeps a ripple where `PresstableOpacity` turns it off. On Android a
 * pressable with no ripple gets the platform's default keyboard-focus
 * highlight, which is a rectangle. A ripple handles the focused state itself
 * and is masked by the pressable's `rounded-full`, so focus draws a circle.
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
      // A composed color needs a hex, so this can't be a token. Android only.
      rippleColor={`${accentForeground}3D`}
    >
      <Ionicons color={accentForeground} name={icon} size={SIZE[size].icon} />
    </PresstableOpacity>
  );
}
