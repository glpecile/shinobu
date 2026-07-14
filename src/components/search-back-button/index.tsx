import { Ionicons } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';

/** Native search needs a compact return control beside its input. */
export function SearchBackButton({ onPress }: { onPress: () => void }) {
  const foreground = useCSSVariable('--color-foreground');

  return (
    <PresstableOpacity
      accessibilityLabel="Back"
      className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center"
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
