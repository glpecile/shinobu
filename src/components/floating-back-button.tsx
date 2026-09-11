import Ionicons from '@react-native-vector-icons/ionicons/static';

import { PresstableOpacity } from '@/components/presstable';
import { useThemeColor } from '@/lib/theme-color';

/** The round back button floating over detail-style screens. */
export function FloatingBackButton({ onPress }: { onPress: () => void }) {
  const foreground = useThemeColor('--color-foreground');

  return (
    <PresstableOpacity
      accessibilityLabel="Back"
      className="absolute top-12 left-4 w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center"
      onPress={onPress}
    >
      <Ionicons
        color={foreground}
        name="arrow-back"
        size={20}
      />
    </PresstableOpacity>
  );
}
