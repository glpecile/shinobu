import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { SegmentedControl, type SegmentedControlProps } from '@/components/segmented-control';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/** Android's pager strip follows the swipe; its format strip keeps native buttons. */
export function SeasonTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  size = 'md',
  className,
  progress,
}: SegmentedControlProps<T>) {
  const foreground = useThemeColor('--color-foreground');
  const background = useThemeColor('--color-background');
  const border = useThemeColor('--color-border');
  const accent = useThemeColor('--color-accent');
  const accentTonal = useThemeColor('--color-accent-tonal');
  const accentOnTonal = useThemeColor('--color-accent-on-tonal');
  const colors = {
    activeContainerColor: accentTonal,
    activeContentColor: accentOnTonal,
    activeBorderColor: accent,
    inactiveContainerColor: background,
    inactiveContentColor: foreground,
    inactiveBorderColor: border,
  };

  // Compose paints the pager row with its Material palette despite the button
  // colors. The app control keeps the selection red and follows the swipe.
  if (progress != null) {
    return (
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        className={className}
        onChange={onChange}
        options={options}
        progress={progress}
        size={size}
        tone="accent"
        value={value}
      />
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} className={className}>
      <Host matchContents={size === 'sm' ? true : { vertical: true }}>
        <SingleChoiceSegmentedButtonRow>
          {options.map((option) => (
            <SegmentedButton
              colors={colors}
              key={option.value}
              onClick={() => {
                if (option.value === value) return;
                haptics.selection();
                onChange(option.value);
              }}
              selected={option.value === value}
            >
              <SegmentedButton.Label>
                <Text
                  color={option.value === value ? accentOnTonal : foreground}
                  maxLines={1}
                  style={{ typography: size === 'sm' ? 'labelMedium' : 'labelLarge' }}
                >
                  {option.label}
                </Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
