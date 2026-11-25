import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { View } from 'react-native';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type OverlayActionsButtonSize = 'sm' | 'md' | 'lg';
export type OverlayActionsButtonTone = 'overlay' | 'surface';

const SIZE: Record<OverlayActionsButtonSize, { box: string; icon: number }> = {
  sm: { box: 'w-7 h-7', icon: 14 },
  lg: { box: 'w-7 h-7', icon: 14 },
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

/** Render beside the poster pressable: nesting gesture-handler buttons lets a press bubble into the poster underneath. */
export function OverlayActionsButton({
  label,
  onPress,
  size = 'md',
  tone = 'overlay',
  visible = true,
  className,
}: {
  label: string;
  onPress: () => void;
  size?: OverlayActionsButtonSize;
  tone?: OverlayActionsButtonTone;
  visible?: boolean;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const shown = visible || focused;
  const icon = useThemeColor(ICON_TOKEN[tone]);
  return (
    <AnimatedView
      className={cn(className)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? 'auto' : 'none',
        transitionProperty: 'opacity',
        transitionDuration: focused ? 0 : DURATION.exit,
        transitionTimingFunction: EASE_OUT,
      }}
    >
      <PresstableOpacity
        accessibilityLabel={label}
        accessibilityRole="button"
        className={cn(
          'items-center justify-center rounded-full',
          size === 'lg' ? 'w-11 h-11' : SIZE[size].box,
          'web:focus-visible:outline-2 web:focus-visible:outline-accent web:focus-visible:outline-offset-2',
        )}
        onPress={onPress}
      >
        <View className={cn('items-center justify-center rounded-full', SIZE[size].box, SURFACE[tone])}>
          <Ionicons
            color={icon}
            name="ellipsis-horizontal"
            size={SIZE[size].icon}
          />
        </View>
      </PresstableOpacity>
    </AnimatedView>
  );
}
