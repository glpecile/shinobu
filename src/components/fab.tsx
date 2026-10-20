import Ionicons from '@react-native-vector-icons/ionicons/static';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useThemeColor, type ThemeColorToken } from '@/lib/theme-color';

export type FabSize = 'sm' | 'md';
export type FabShape = 'squircle' | 'circle';
export type FabVariant = 'outline' | 'filled' | 'log';

const SIZE = {
  sm: { box: 'size-11', squircle: 'rounded-xl', icon: 20 },
  md: { box: 'size-14', squircle: 'rounded-[20px]', icon: 24 },
};

const VARIANT: Record<FabVariant, { color: ThemeColorToken; box: string }> = {
  outline: { color: '--color-foreground', box: 'border border-border bg-surface shadow-md' },
  filled: { color: '--color-background', box: 'bg-foreground' },
  log: { color: '--color-log-foreground', box: 'bg-log' },
};

export interface FabProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  onPress: () => void | boolean;
  /** Fixed dimensions on every platform: sm = 44, md = 56. */
  size?: FabSize;
  shape?: FabShape;
  variant?: FabVariant;
  loading?: boolean;
  /** Positioning and margins only. Size and shape belong to their props. */
  className?: string;
}

/**
 * A compact floating action with independent size, shape, and color variants.
 * Borders live on the inner View because Android does not draw them on pressto.
 */
export function Fab({
  icon,
  label,
  hint,
  onPress,
  size = 'md',
  shape = 'squircle',
  variant = 'outline',
  loading = false,
  className,
}: FabProps) {
  const color = useThemeColor(VARIANT[variant].color);
  const radius = shape === 'circle' ? 'rounded-full' : SIZE[size].squircle;
  // Ionicons' film frame is shorter than its nominal glyph box.
  const iconSize = SIZE[size].icon + (icon === 'film-outline' ? 4 : 0);
  return (
    <PresstableOpacity
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      aria-busy={loading}
      aria-disabled={loading}
      disabled={loading}
      className={cn(
        className,
        'self-start grow-0 shrink-0 items-center justify-center web:focus-visible:outline-2 web:focus-visible:outline-foreground web:focus-visible:outline-offset-2',
        SIZE[size].box,
        radius,
      )}
      onPress={() => {
        if (onPress() !== false) haptics.selection();
      }}
      // 3D is 24% alpha, the tab bar's ripple strength. Android only.
      rippleColor={`${color}3D`}
    >
      <View className={cn(
        'items-center justify-center',
        SIZE[size].box,
        radius,
        VARIANT[variant].box,
      )}>
        {loading ? <Spinner color={color} /> : <Ionicons color={color} name={icon} size={iconSize} />}
      </View>
    </PresstableOpacity>
  );
}
