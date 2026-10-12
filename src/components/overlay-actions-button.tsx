import Ionicons from '@react-native-vector-icons/ionicons/static';

import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type OverlayActionsButtonSize = 'sm' | 'md';
export type OverlayActionsButtonTone = 'overlay' | 'surface';

const SIZE: Record<OverlayActionsButtonSize, { box: string; icon: number }> = {
  sm: { box: 'w-7 h-7', icon: 14 },
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
 * The web-only ⋯ that opens an item's actions dialog, floating over its top
 * corner — media and episode cards, poster walls, person cards, link pills.
 * Web has no discoverable long-press, so hovering reveals this; native uses
 * long-press and never renders it. Callers own the hover state and the
 * `EXPO_OS === 'web'` gate, and render this as a *sibling* of the pressable,
 * never a child — nesting two gesture-handler buttons lets a ⋯ press bubble
 * into the press beneath.
 *
 * `className` is positioning only (e.g. `absolute -top-3 -right-3`); the badge
 * owns its size, shape, and surface through `size` and `tone`.
 */
export function OverlayActionsButton({
  label,
  onPress,
  size = 'md',
  tone = 'overlay',
  className,
}: {
  /** Spoken label, e.g. `More options for ${title}`. */
  label: string;
  onPress: () => void;
  size?: OverlayActionsButtonSize;
  tone?: OverlayActionsButtonTone;
  /** Positioning only. */
  className?: string;
}) {
  const icon = useThemeColor(ICON_TOKEN[tone]);
  return (
    <PresstableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      className={cn(
        'items-center justify-center rounded-full',
        SIZE[size].box,
        SURFACE[tone],
        className,
      )}
      onPress={onPress}
    >
      <Ionicons
        color={icon}
        name="ellipsis-horizontal"
        size={SIZE[size].icon}
      />
    </PresstableOpacity>
  );
}
