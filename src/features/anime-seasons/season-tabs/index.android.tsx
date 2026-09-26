import { Host } from '@expo/ui';
import {
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { useColorScheme, View } from 'react-native';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/** Material 3 owns the selected shape, colours, and press feedback. */
export function SeasonTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>) {
  const scheme = useColorScheme();
  const accent = useThemeColor('--color-accent');
  const active = useThemeColor('--color-accent-tonal');
  const activeText = useThemeColor('--color-accent-on-tonal');
  const background = useThemeColor('--color-background');
  const border = useThemeColor('--color-border');
  const foreground = useThemeColor('--color-foreground');
  return (
    <View accessibilityLabel={accessibilityLabel} className={className}>
      <Host colorScheme={scheme} matchContents={{ vertical: true }} seedColor={accent} style={{ width: '100%' }}>
        <SingleChoiceSegmentedButtonRow>
          {options.map((option) => (
            <SegmentedButton
              colors={{
                activeBorderColor: border,
                activeContainerColor: active,
                activeContentColor: activeText,
                inactiveBorderColor: border,
                inactiveContainerColor: background,
                inactiveContentColor: foreground,
              }}
              key={option.value}
              onClick={() => {
                if (option.value === value) return;
                haptics.selection();
                onChange(option.value);
              }}
              selected={option.value === value}
            >
              <SegmentedButton.Label>
                <Text>{option.label}</Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
