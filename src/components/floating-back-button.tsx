import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';

export const FLOATING_BACK_BUTTON_SIZE = 44;
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
  const top = useFloatingBackButtonTop();

  return (
    <BackButton
      className="absolute left-4"
      onPress={onPress}
      style={{ top }}
    />
  );
}
