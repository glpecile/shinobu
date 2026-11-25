import { Switch } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

export interface NativeSwitchProps {
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  value: boolean;
}

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
