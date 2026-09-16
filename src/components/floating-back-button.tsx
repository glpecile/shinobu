import Ionicons from '@react-native-vector-icons/ionicons/static';

import { RoundIconButton } from '@/components/round-icon-button';
import { useThemeColor } from '@/lib/theme-color';

/** The round back button floating over detail-style screens. */
export function FloatingBackButton({ onPress }: { onPress: () => void }) {
  const foreground = useThemeColor('--color-foreground');

  return (
    <RoundIconButton
      className="absolute top-12 left-4"
      icon={<Ionicons color={foreground} name="arrow-back" size={20} />}
      label="Back"
      onPress={onPress}
    />
  );
}
