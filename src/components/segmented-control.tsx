import { Text, View } from 'react-native';
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
  tone?: 'default' | 'accent';
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

const segmentClass = (size: 'sm' | 'md') =>
  cn('flex-1 items-center rounded-full', size === 'sm' ? 'py-1' : 'py-1.5');
const labelClass = (size: 'sm' | 'md') =>
  cn('font-sans-semibold', size === 'sm' ? 'text-xs' : 'text-sm');

/**
 * Percentage translations are relative to each moving view: one segment for
 * the pill, the whole row for its counter-moving text. Neither needs a layout
 * measurement, so the same pill is visible from the first frame.
 */
function SelectionPill<T extends string>({
  options,
  value,
  size,
  progress,
  tone,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  size: 'sm' | 'md';
  progress?: SharedValue<number>;
  tone: 'default' | 'accent';
}) {
  const reduceMotion = useReducedMotion();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const pillFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: `${progress.value * 100}%` }] } : {},
  );
  const copyFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: `${-progress.value * 100 / options.length}%` }] } : {},
  );
  const slide = (offset: `${number}%`) => ({
    transform: [{ translateX: offset }],
    transitionProperty: 'transform' as const,
    transitionDuration: reduceMotion ? 0 : DURATION.toggle,
    transitionTimingFunction: EASE_IN_OUT,
  });

  return (
    <AnimatedView
      className={cn(
        'absolute rounded-full overflow-hidden',
        tone === 'accent' ? 'bg-accent-tonal' : 'bg-foreground',
      )}
      style={[
        {
          top: 0,
          bottom: 0,
          left: 0,
          width: `${100 / options.length}%` as `${number}%`,
          pointerEvents: 'none',
        },
        progress ? pillFollow : slide(`${index * 100}%`),
      ]}
    >
      <AnimatedView
        className="flex-1 flex-row"
        style={[
          { width: `${options.length * 100}%` as `${number}%` },
          progress ? copyFollow : slide(`${-index * 100 / options.length}%`),
        ]}
      >
        {options.map((option) => (
          <View className={segmentClass(size)} key={option.value}>
            <Text
              className={cn(
                labelClass(size),
                tone === 'accent' ? 'text-accent-on-tonal' : 'text-background',
              )}
              numberOfLines={1}
            >
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
  tone = 'default',
  className,
  progress,
}: SegmentedControlProps<T>) {
  const segmentClassName = segmentClass(size);
  const labelClassName = labelClass(size);

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
        'flex-row rounded-full border border-border p-0.5',
        className,
      )}
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
          <Text
            className={cn(labelClassName, 'text-foreground')}
            numberOfLines={1}
          >
            {option.label}
          </Text>
        </PresstableOpacity>
      ))}
      <View className="absolute inset-0.5 border border-transparent" style={{ pointerEvents: 'none' }}>
        <SelectionPill
          options={options}
          progress={progress}
          size={size}
          tone={tone}
          value={value}
        />
      </View>
    </View>
  );
}
