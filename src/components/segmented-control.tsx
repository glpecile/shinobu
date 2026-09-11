import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { AnimatedText, AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Spoken name when `label` is too terse ("TV" → "TV series"). */
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech ("Season", "Format"). */
  accessibilityLabel: string;
  size?: 'sm' | 'md';
  /** Layout only (width, margins) — the control styles itself. */
  className?: string;
  /**
   * The selection as a continuous index (1.4 is between the second and third
   * segment), for a control that fronts a pager: the pill follows it on the
   * UI thread — under the finger mid-swipe, alongside a page scroll a tab tap
   * started — instead of sliding on its own once `value` settles.
   */
  progress?: SharedValue<number>;
}

/** Inset between the border and the sliding pill, in px. */
const INSET = 2;

/**
 * Equal-width segments with one pill that *slides* to the selection instead
 * of each segment repainting — the same declarative Reanimated CSS transition
 * the disclosure chevrons use, so it runs on the UI thread natively and as a
 * CSS transition on web. The labels crossfade their colour underneath it.
 *
 * Inverted active state (foreground pill, background text), not the accent:
 * the accent means "this is the action" everywhere else, and a segmented
 * control only changes what you are looking at (same reasoning as
 * `features/watchlist/watchlist-toolbar.tsx`'s filter pill).
 *
 * Controlled only. Segments are equal width by design — a content-sized
 * variant would need per-segment measurement; add it when a caller has labels
 * too uneven to share a width.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  size = 'md',
  className,
  progress,
}: SegmentedControlProps<T>) {
  const foregroundToken = useCSSVariable('--color-foreground');
  const backgroundToken = useCSSVariable('--color-background');
  const foreground = typeof foregroundToken === 'string' ? foregroundToken : undefined;
  const background = typeof backgroundToken === 'string' ? backgroundToken : undefined;
  const reduceMotion = useReducedMotion();
  // The pill's geometry derives from the measured width, so it is not
  // rendered at all until the first layout. A pill mounted at the left edge
  // and then moved into place slides there — on web unavoidably, because the
  // browser transitions from the last *painted* style whatever the duration
  // was at the moment of the move — so every screen opened on a non-first
  // option played that slide. A freshly mounted element has nothing to
  // transition from, on either platform.
  const [width, setWidth] = useState(0);
  const measured = width > 0;
  const segmentWidth = measured ? (width - INSET * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const followStyle = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: progress.value * segmentWidth }] } : {},
  );

  function onLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  }

  function select(next: T) {
    if (next === value) return;
    haptics.selection();
    onChange(next);
  }

  return (
    // Each segment is a `button` with `selected` state, not a `tab` in a
    // `tablist`: the tab role stops pressto's web pressable from firing at
    // all (docs/solutions/pressto-tab-role-swallows-web-presses.md).
    <View
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'flex-row rounded-full border border-border',
        className,
      )}
      onLayout={onLayout}
      style={{ padding: INSET }}
    >
      {measured && (
        <AnimatedView
          className="absolute rounded-full bg-foreground"
          pointerEvents="none"
          style={[
            { top: INSET, bottom: INSET, left: INSET, width: segmentWidth },
            progress
              ? followStyle
              : {
                  transform: [{ translateX: index * segmentWidth }],
                  transitionProperty: 'transform',
                  transitionDuration: reduceMotion ? 0 : DURATION.toggle,
                  transitionTimingFunction: EASE_IN_OUT,
                },
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PresstableOpacity
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={cn(
              'flex-1 items-center rounded-full',
              size === 'sm' ? 'py-1' : 'py-1.5',
            )}
            key={option.value}
            onPress={() => select(option.value)}
          >
            <AnimatedText
              className={cn('font-sans-semibold', size === 'sm' ? 'text-xs' : 'text-sm')}
              numberOfLines={1}
              style={{
                color: selected ? background : foreground,
                transitionProperty: 'color',
                transitionDuration: reduceMotion ? 0 : DURATION.color,
              }}
            >
              {option.label}
            </AnimatedText>
          </PresstableOpacity>
        );
      })}
    </View>
  );
}
