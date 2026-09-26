import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundIconButton } from '@/components/round-icon-button';
import { useThemeColor } from '@/lib/theme-color';

export const FLOATING_BACK_BUTTON_SIZE = 40;
export const FLOATING_BACK_BUTTON_GAP = 8;
const WEB_BACK_BUTTON_TOP = 16;

/** The back button's top: compact on web; native clears the status bar. */
export function useFloatingBackButtonTop() {
  const insets = useSafeAreaInsets();
  if (process.env.EXPO_OS === 'web') return WEB_BACK_BUTTON_TOP;
  return Math.max(
    FLOATING_BACK_BUTTON_SIZE + FLOATING_BACK_BUTTON_GAP,
    insets.top + FLOATING_BACK_BUTTON_GAP,
  );
}

/** Top padding for a header that starts under the button, 24 clear of it. */
export function useFloatingBackButtonClearance() {
  return useFloatingBackButtonTop() + FLOATING_BACK_BUTTON_SIZE + 24;
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
