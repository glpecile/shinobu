import { View } from 'react-native';

import { Fab } from '@/components/fab';
import {
  useCatchUpControls,
  useQuickLogBusy,
} from '@/features/log-media/session/state';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';

/**
 * The Continue Watching log button. Tapping it opens the app-level catch-up
 * sheet (`features/log-media/session`, plan 0037) on this entry: the same
 * confirm modal every log entry point uses, which then walks the show's
 * aired-but-unwatched backlog one confirm at a time. The write itself is the
 * shared `useLogMedia` fan-out — never a single-provider write (plan 0019 R7).
 *
 * The button owns nothing but the tap. Nothing advances optimistically
 * (KTD-6): once a write lands, the button spins until the Up Next slot's
 * awaited invalidation resolves, and the card then advances, moves, or
 * disappears purely from recomputed data — the button never animates a
 * counter of its own. The sheet lives above the card, which can unmount
 * mid-chain once the show is caught up.
 *
 * Typed to the `episode` arm of the union, not `UpNextEntry`: a release entry
 * has no episode to log (plan 0030 R5), so callers narrow rather than this
 * component null-checking a field it always needs.
 */
export function QuickLogButton({ entry }: { entry: UpNextEpisodeEntry }) {
  const { openCatchUp } = useCatchUpControls();
  const pending = useQuickLogBusy(entry.item.id);

  function openConfirm() {
    if (pending) return;
    openCatchUp(entry);
  }

  return (
    <View className="items-end">
      <Fab
        icon="eye-outline"
        label={`Log episode ${entry.episode.number} of ${entry.item.title.trim() || 'Untitled'}`}
        loading={pending}
        onPress={openConfirm}
        size="sm"
      />
    </View>
  );
}
