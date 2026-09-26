import NativeSegmentedControl from '@expo/ui/community/segmented-control';
import { useColorScheme, View } from 'react-native';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { haptics } from '@/lib/haptics';

/**
 * The seasons explorer's tab strips as SwiftUI's segmented `Picker`. Android
 * has its own themed Material 3 row, and web keeps `SegmentedControl`.
 * The native control can't follow the pager's
 * `progress` mid-swipe, so it moves once the swipe settles and `value` changes.
 */
export function SeasonTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>) {
  const scheme = useColorScheme();
  return (
    <View accessibilityLabel={accessibilityLabel} className={className}>
      <NativeSegmentedControl
        {...(scheme === 'light' || scheme === 'dark' ? { appearance: scheme } : {})}
        onChange={({ nativeEvent }) => {
          const next = options[nativeEvent.selectedSegmentIndex];
          if (next == null || next.value === value) return;
          haptics.selection();
          onChange(next.value);
        }}
        selectedIndex={options.findIndex((option) => option.value === value)}
        values={options.map((option) => option.label)}
      />
    </View>
  );
}
