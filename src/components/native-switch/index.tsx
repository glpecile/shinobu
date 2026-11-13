import { Switch } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

export interface NativeSwitchProps {
  /** Read by screen readers; the visible label sits beside the switch. */
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  value: boolean;
}

/**
 * Web has no system switch to host; React Native's renders a checkbox-backed
 * one, tinted with the theme in place of react-native-web's teal.
 */
export function NativeSwitch({ accessibilityLabel, disabled, onValueChange, value }: NativeSwitchProps) {
  const accent = useThemeColor('--color-accent');
  const accentForeground = useThemeColor('--color-accent-foreground');
  const border = useThemeColor('--color-border');
  const muted = useThemeColor('--color-muted');
  // Cast: react-native-web's on-state thumb prop, which React Native's types lack.
  const activeThumb = { activeThumbColor: accentForeground } as object;
  return (
    <Switch
      {...activeThumb}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onValueChange={onValueChange}
      thumbColor={muted}
      trackColor={{ false: border, true: accent }}
      value={value}
    />
  );
}
