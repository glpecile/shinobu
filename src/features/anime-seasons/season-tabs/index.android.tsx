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

/** Android uses a stable selected segment for the pager and native format buttons. */
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
  // colors. A static selected segment stays red from the first frame without
  // swapping to a measured pill once layout completes.
  if (progress != null) {
    return (
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        animated={false}
        className={className}
        onChange={onChange}
        options={options}
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
