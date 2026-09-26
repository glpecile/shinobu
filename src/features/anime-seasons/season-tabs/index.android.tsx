import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The seasons explorer's tab strips as Material 3's segmented button row,
 * built from the Compose primitives because `@expo/ui`'s community wrapper
 * only themes the selected fill. A surface fill and native check mark indicate
 * selection without competing with the posters. Like iOS, it moves once
 * the pager settles rather than following `progress`.
 */
export function SeasonTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const foreground = useThemeColor('--color-foreground');
  const background = useThemeColor('--color-background');
  const surface = useThemeColor('--color-surface');
  const border = useThemeColor('--color-border');
  const colors = {
    activeContainerColor: surface,
    activeContentColor: foreground,
    activeBorderColor: border,
    inactiveContainerColor: background,
    inactiveContentColor: foreground,
    inactiveBorderColor: border,
  };

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
