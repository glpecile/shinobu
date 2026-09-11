import { Text, View } from 'react-native';

import { PresstableOpacity } from '@/components/presstable';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';

/**
 * The year jump behind the explorer's year label: a grid of every year in
 * range, newest first, in the app's bottom sheet. A stepper alone made a
 * decade ten taps; this makes any year one.
 */
export function YearSheet({
  open,
  onClose,
  value,
  min,
  max,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  value: number;
  min: number;
  max: number;
  onSelect: (year: number) => void;
}) {
  const years = Array.from({ length: max - min + 1 }, (_, index) => max - index);

  return (
    <Sheet onClose={onClose} open={open}>
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
        Jump to year
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {years.map((year) => {
          const selected = year === value;
          return (
            <PresstableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={cn(
                'w-[23%] py-2.5 items-center rounded-lg border border-border',
                selected && 'bg-foreground border-foreground',
              )}
              key={year}
              onPress={() => {
                haptics.selection();
                onSelect(year);
              }}
            >
              <Text
                className={cn(
                  'font-sans text-base text-foreground',
                  selected && 'font-sans-semibold text-background',
                )}
              >
                {year}
              </Text>
            </PresstableOpacity>
          );
        })}
      </View>
    </Sheet>
  );
}
