import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

/** The app's activity indicator; callers can retain their surrounding control's color. */
export function Spinner({ color, size = 'small', ...props }: ActivityIndicatorProps) {
  const muted = useThemeColor('--color-muted');
  return <ActivityIndicator color={color ?? muted} size={size} {...props} />;
}
