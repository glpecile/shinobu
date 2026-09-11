import Ionicons from '@react-native-vector-icons/ionicons/static';
import { ActivityIndicator, View } from 'react-native';

import { PresstableScale } from '@/components/presstable';
import {
  useCatchUpControls,
  useQuickLogBusy,
} from '@/features/up-next/catch-up/state';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { haptics } from '@/lib/haptics';
import { useThemeColor } from '@/lib/theme-color';

/**
 * The Continue Watching checkmark. Tapping it opens the app-level catch-up
 * sheet (`features/up-next/catch-up`, plan 0037) on this entry: the same
 * confirm modal every log entry point uses, which then walks the show's
 * aired-but-unwatched backlog one confirm at a time. The write itself is the
 * shared `useLogMedia` fan-out — never a single-provider write (plan 0019 R7).
 *
 * The button owns nothing but the tap. Nothing advances optimistically
 * (KTD-6): once a write lands, the button spins until the Up Next slot's
 * awaited invalidation resolves, and the card then advances, moves, or
 * disappears purely from recomputed data — which is why it simply unmounts
 * (its entry id carries the episode number) rather than animating a counter.
 * The sheet lives above the card for exactly that reason.
 *
 * Typed to the `episode` arm of the union, not `UpNextEntry`: a release entry
 * has no episode to log (plan 0030 R5), so callers narrow rather than this
 * component null-checking a field it always needs.
 */
export function QuickLogButton({ entry }: { entry: UpNextEpisodeEntry }) {
  const { openCatchUp } = useCatchUpControls();
  const pending = useQuickLogBusy(entry.item.id);
  const accentForeground = useThemeColor('--color-accent-foreground');
  const iconColor =
    accentForeground;

  function openConfirm() {
    if (pending) return;
    haptics.selection();
    openCatchUp(entry);
  }

  return (
    <View className="items-end">
      <PresstableScale
        accessibilityLabel={`Log episode ${entry.episode.number} of ${entry.item.title}`}
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        className="w-9 h-9 items-center justify-center rounded-full bg-accent"
        onPress={openConfirm}
      >
        {pending ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : (
          <Ionicons color={iconColor} name="checkmark" size={18} />
        )}
      </PresstableScale>
    </View>
  );
}
