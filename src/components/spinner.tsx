import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';

import { useThemeColor } from '@/lib/theme-color';

export function Spinner({ color, size = 'small', ...props }: ActivityIndicatorProps) {
  const muted = useThemeColor('--color-muted');
  return <ActivityIndicator color={color ?? muted} size={size} {...props} />;
}
