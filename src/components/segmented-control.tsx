import { Text, View } from 'react-native';
import { useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { PresstableOpacity } from '@/components/presstable';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { DURATION, EASE_IN_OUT } from '@/lib/motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'accent';
  className?: string;
  /** Continuous 0-based segment index (not 0–1) driving the pill position on the UI thread. */
  progress?: SharedValue<number>;
}

const segmentClass = (size: 'sm' | 'md') =>
  cn('flex-1 items-center justify-center rounded-full', size === 'sm' ? 'py-1' : 'py-1.5');
const labelClass = (size: 'sm' | 'md') =>
  cn('font-sans-semibold', size === 'sm' ? 'text-xs' : 'text-sm');

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
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const pillFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: `${progress.get() * 100}%` }] } : {},
  );
  const copyFollow = useAnimatedStyle(() =>
    progress ? { transform: [{ translateX: `${(-progress.get() * 100) / options.length}%` }] } : {},
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
          progress ? copyFollow : slide(`${(-index * 100) / options.length}%`),
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
    // `tablist`: the web Presstable renders every role as a button
    // (docs/solutions/web-pressables-skip-gesture-handler.md).
    <View
      accessibilityLabel={accessibilityLabel}
      className={cn('flex-row rounded-full border border-border p-0.5', className)}
    >
      {options.map((option) => (
        <PresstableOpacity
          accessibilityLabel={option.accessibilityLabel ?? option.label}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          className={cn(segmentClassName, 'min-h-11 pointer-fine:min-h-0')}
          key={option.value}
          onPress={() => select(option.value)}
        >
          <Text className={cn(labelClassName, 'text-foreground')} numberOfLines={1}>
            {option.label}
          </Text>
        </PresstableOpacity>
      ))}
      <View
        className="absolute inset-0.5 border border-transparent"
        style={{ pointerEvents: 'none' }}
      >
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
