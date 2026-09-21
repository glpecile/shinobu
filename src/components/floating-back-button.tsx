import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundIconButton } from '@/components/round-icon-button';
import { useThemeColor } from '@/lib/theme-color';

/** The back button's top: 8 under the status bar, never above 48 (web, short status bars). */
export function useFloatingBackButtonTop() {
  return Math.max(48, useSafeAreaInsets().top + 8);
}

/** Top padding for a header that starts under the button, 24 clear of it. */
export function useFloatingBackButtonClearance() {
  return useFloatingBackButtonTop() + 64;
}

/** The round back button floating over detail-style screens. */
export function FloatingBackButton({ onPress }: { onPress: () => void }) {
  const foreground = useThemeColor('--color-foreground');
  const top = useFloatingBackButtonTop();

  return (
    <RoundIconButton
      className="absolute left-4"
      icon={<Ionicons color={foreground} name="arrow-back" size={20} />}
      label="Back"
      onPress={onPress}
      style={{ top }}
    />
  );
}
