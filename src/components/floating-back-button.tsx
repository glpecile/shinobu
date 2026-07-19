import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';

/** The round back button floating over detail-style screens. */
export function FloatingBackButton({ onPress }: { onPress: () => void }) {
  const foreground = useCSSVariable('--color-foreground');

  return (
    <PresstableOpacity
      accessibilityLabel="Back"
      className="absolute top-12 left-4 w-10 h-10 rounded-full bg-surface/90 border border-border items-center justify-center"
      onPress={onPress}
    >
      <Ionicons
        color={typeof foreground === 'string' ? foreground : undefined}
        name="arrow-back"
        size={20}
      />
    </PresstableOpacity>
  );
}
