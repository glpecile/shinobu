import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel as nativeAccessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme, View } from 'react-native';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { haptics } from '@/lib/haptics';

/** SwiftUI owns the selection appearance and its native transition. */
export function SeasonTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>) {
  const scheme = useColorScheme();
  return (
    <View className={className}>
      <Host colorScheme={scheme} style={{ height: 36, width: '100%' }}>
        <Picker
          label={accessibilityLabel}
          modifiers={[pickerStyle('segmented')]}
          onSelectionChange={(next) => {
            if (next === value) return;
            haptics.selection();
            onChange(next as T);
          }}
          selection={value}
        >
          {options.map((option) => (
            <Text
              key={option.value}
              modifiers={[
                tag(option.value),
                nativeAccessibilityLabel(option.accessibilityLabel ?? option.label),
              ]}
            >
              {option.label}
            </Text>
          ))}
        </Picker>
      </Host>
    </View>
  );
}
