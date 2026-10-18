import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type OverlayActionsButtonSize = 'sm' | 'md' | 'lg';
export type OverlayActionsButtonTone = 'overlay' | 'surface';

const SIZE: Record<OverlayActionsButtonSize, { box: string; icon: number }> = {
  sm: { box: 'w-7 h-7', icon: 14 },
  lg: { box: 'w-11 h-11', icon: 20 },
  md: { box: 'w-8 h-8', icon: 16 },
};

const SURFACE: Record<OverlayActionsButtonTone, string> = {
  overlay: 'bg-black/60',
  surface: 'bg-surface/95 border border-border/40',
};

const ICON_TOKEN: Record<OverlayActionsButtonTone, ThemeColorToken> = {
  overlay: '--color-accent-foreground',
  surface: '--color-foreground',
};

/**
 * The ⋯ over a poster's corner. Callers reveal it on web hover, or keep it
 * visible on editable lists, using `lg` for a touch-sized target. Render it
 * beside the poster pressable: nesting gesture-handler buttons lets a press
 * bubble into the poster underneath.
 *
 * `className` positions the control; size and tone own its appearance.
 */
export function OverlayActionsButton({
  label,
  onPress,
  size = 'md',
  tone = 'overlay',
  visible = true,
  className,
}: {
  /** Spoken label, e.g. `More options for ${title}`. */
  label: string;
  onPress: () => void;
  size?: OverlayActionsButtonSize;
  tone?: OverlayActionsButtonTone;
  /** Hidden controls stay keyboard reachable and reveal themselves on focus. */
  visible?: boolean;
  /** Positioning only. */
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const shown = visible || focused;
  const icon = useThemeColor(ICON_TOKEN[tone]);
  return (
    <View
      className={cn(className)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
    >
      <PresstableOpacity
        accessibilityLabel={label}
        accessibilityRole="button"
        className={cn(
          'items-center justify-center rounded-full',
          SIZE[size].box,
          SURFACE[tone],
          'web:focus-visible:outline-2 web:focus-visible:outline-accent web:focus-visible:outline-offset-2',
        )}
        onPress={onPress}
      >
        <Ionicons
          color={icon}
          name="ellipsis-horizontal"
          size={SIZE[size].icon}
        />
      </PresstableOpacity>
    </View>
  );
}
