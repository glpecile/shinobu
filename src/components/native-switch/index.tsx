import { Switch } from 'react-native';

export interface NativeSwitchProps {
  /** Read by screen readers; the visible label sits beside the switch. */
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  value: boolean;
}

/** Web has no system switch to host; React Native's renders a checkbox-backed one. */
export function NativeSwitch({ accessibilityLabel, disabled, onValueChange, value }: NativeSwitchProps) {
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    />
  );
}
