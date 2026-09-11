import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
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

const segmentClass = (size: 'sm' | 'md') =>
  cn('flex-1 items-center rounded-full', size === 'sm' ? 'py-1' : 'py-1.5');
const labelClass = (size: 'sm' | 'md') =>
  cn('font-sans-semibold', size === 'sm' ? 'text-xs' : 'text-sm');

/**
 * The sliding pill and its inverted copy of the label row, mounted only once
 * the control has been measured — and a component of its own *because* of
 * that. Reanimated computes an animated style's initial value on the hook's
 * first render and never recomputes it, so hooks living in the parent run
 * first on the pre-measurement render, where the segment width is still 0:
 * the pill paints on the first segment for a frame before the post-paint
 * update moves it, and reloading Summer flashed Winter
 * (docs/solutions/reanimated-animated-style-initial-value-is-first-render.md).
 * Mounted here, the first run sees the real width and the pill's first paint
 * is its resting place.
 */
function SelectionPill<T extends string>({
  options,
  value,
  segmentWidth,
  size,
  progress,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  segmentWidth: number;
  size: 'sm' | 'md';
  progress?: SharedValue<number>;
}) {
  const reduceMotion = useReducedMotion();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const pillFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: progress.value * segmentWidth }] } : {},
  );
  const copyFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: -progress.value * segmentWidth }] } : {},
  );
  const slide = (offset: number) => ({
    transform: [{ translateX: offset }],
    transitionProperty: 'transform' as const,
    transitionDuration: reduceMotion ? 0 : DURATION.toggle,
    transitionTimingFunction: EASE_IN_OUT,
  });

  return (
    <AnimatedView
      className="absolute rounded-full bg-foreground overflow-hidden"
      style={[
        { top: INSET, bottom: INSET, left: INSET, width: segmentWidth, pointerEvents: 'none' },
        progress ? pillFollow : slide(index * segmentWidth),
      ]}
    >
      <AnimatedView
        className="flex-1 flex-row"
        style={[
          { width: segmentWidth * options.length },
          progress ? copyFollow : slide(-index * segmentWidth),
        ]}
      >
        {options.map((option) => (
          <View className={segmentClass(size)} key={option.value}>
            <Text className={cn(labelClass(size), 'text-background')} numberOfLines={1}>
              {option.label}
            </Text>
          </View>
        ))}
      </AnimatedView>
    </AnimatedView>
  );
}

/**
 * Equal-width segments with one pill that *slides* to the selection instead
 * of each segment repainting — the same declarative Reanimated CSS transition
 * the disclosure chevrons use, so it runs on the UI thread natively and as a
 * CSS transition on web. The pill is a clipped copy of the label row in the
 * inverted colours, counter-translated so the copy stays put while the pill
 * moves: the inverted text *is* the pill, so it tracks it to the pixel at
 * every position, mid-swipe included. Fading each label's colour instead
 * could only ever be keyed to the settled value, so it lagged the pill and
 * jumped at the end.
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
  const segmentClassName = segmentClass(size);
  const labelClassName = labelClass(size);

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
      {options.map((option) => (
        <PresstableOpacity
          accessibilityLabel={option.accessibilityLabel ?? option.label}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          className={segmentClassName}
          key={option.value}
          onPress={() => select(option.value)}
        >
          <Text className={cn(labelClassName, 'text-foreground')} numberOfLines={1}>
            {option.label}
          </Text>
        </PresstableOpacity>
      ))}
      {measured && (
        <SelectionPill
          options={options}
          progress={progress}
          segmentWidth={segmentWidth}
          size={size}
          value={value}
        />
      )}
    </View>
  );
}
