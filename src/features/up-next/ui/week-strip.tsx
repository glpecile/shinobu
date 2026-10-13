import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedText, AnimatedView } from '@/components/animated-view';
import { PresstableScale } from '@/components/presstable';
import { Rail } from '@/components/rail';
import type { UpNextDayGroup } from '@/features/up-next/compute';
import type { UpNextGroup } from '@/features/up-next/group';
import { DURATION, EASE_IN_OUT, EASE_OUT } from '@/lib/motion';
import { useThemeColor } from '@/lib/theme-color';
import { shortWeekdayName } from '@/lib/time/relative-day';

/** A single selection tile travels behind the dates; interrupted taps retarget it. */
export function WeekStrip({ days, selectedOffset, onChange }: {
  days: readonly (UpNextDayGroup & { groups: UpNextGroup[] })[];
  selectedOffset: number;
  onChange: (offset: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const accent = useThemeColor('--color-accent');
  const selectedColor = useThemeColor('--color-accent-on-tonal');
  const muted = useThemeColor('--color-muted');
  const index = Math.max(0, days.findIndex((day) => day.offset === selectedOffset));
  const duration = reduceMotion ? 0 : DURATION.color;
  return (
    <Rail className="px-4">
      <View>
        <View className="absolute inset-0 flex-row" style={{ pointerEvents: 'none' }}>
          {days.map((day) => <View className="w-14 mr-2 rounded-md border border-border/60 bg-surface" key={day.offset} />)}
        </View>
        <AnimatedView
          className="absolute top-0 bottom-0 left-0 w-14 rounded-md bg-accent-tonal"
          style={{
            pointerEvents: 'none',
            // Each step is a 56px tile plus its 8px gap, relative to the tile's width.
            transform: [{ translateX: `${index * 64 / 56 * 100}%` }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : DURATION.toggle,
            transitionTimingFunction: EASE_IN_OUT,
          }}
        />
        <View className="flex-row">
          {days.map((day) => {
            const selected = day.offset === selectedOffset;
            return (
              <PresstableScale
                accessibilityLabel={`${day.label}, ${day.groups.length} ${day.groups.length === 1 ? 'airing' : 'airings'}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                aria-pressed={selected}
                className="mr-2"
                key={day.offset}
                onPress={() => { if (!selected) onChange(day.offset); }}
              >
                <View className="w-14 py-2 items-center">
                  <AnimatedText className="font-sans text-xs" style={{ color: selected ? selectedColor : muted, transitionProperty: 'color', transitionDuration: duration, transitionTimingFunction: EASE_OUT }}>
                    {shortWeekdayName(day.date)}
                  </AnimatedText>
                  <Text className="text-foreground font-sans-semibold text-base">{day.date.getDate()}</Text>
                  <View className="flex-row items-center gap-0.5 mt-1 h-1.5">
                    {Array.from({ length: Math.min(day.groups.length, 5) }, (_, dot) => (
                      <AnimatedView className="w-1.5 h-1.5 rounded-full" key={dot} style={{ backgroundColor: selected ? selectedColor : accent, transitionProperty: 'backgroundColor', transitionDuration: duration, transitionTimingFunction: EASE_OUT }} />
                    ))}
                  </View>
                </View>
              </PresstableScale>
            );
          })}
        </View>
      </View>
    </Rail>
  );
}
