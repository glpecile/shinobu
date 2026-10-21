import { Host, Switch } from '@expo/ui';
import {
  accessibilityLabel as nativeAccessibilityLabel,
  contentShape,
  frame,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

import type { NativeSwitchProps } from './index';

/** SwiftUI Toggle, tinted with the accent. */
export function NativeSwitch({ accessibilityLabel, disabled, onValueChange, value }: NativeSwitchProps) {
  const scheme = useColorScheme();
  const accent = useThemeColor('--color-accent');
  return (
    <Host colorScheme={scheme ?? undefined} ignoreSafeArea="all" matchContents seedColor={accent}>
      <Switch
        disabled={disabled}
        modifiers={[
          frame({ minHeight: 44 }),
          contentShape(shapes.rectangle(), ['interaction', 'accessibility']),
          nativeAccessibilityLabel(accessibilityLabel),
        ]}
        onValueChange={onValueChange}
        value={value}
      />
    </Host>
  );
}
