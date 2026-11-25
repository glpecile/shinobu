import { Host, Switch } from '@expo/ui';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { useColorScheme } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

import type { NativeSwitchProps } from './index';

/** Compose's Switch throws unless directly under Host and defaults to light scheme / Material blue. */
export function NativeSwitch({ accessibilityLabel, disabled, onValueChange, value }: NativeSwitchProps) {
  const scheme = useColorScheme();
  const accent = useThemeColor('--color-accent');
  return (
    <Host colorScheme={scheme ?? undefined} ignoreSafeArea="all" matchContents seedColor={accent}>
      <Switch
        disabled={disabled}
        modifiers={[semantics({ contentDescription: accessibilityLabel })]}
        onValueChange={onValueChange}
        value={value}
      />
    </Host>
  );
}
