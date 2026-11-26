import { View } from 'react-native';

import { Fab } from '@/components/fab';
import { useCatchUpControls, useQuickLogBusy } from '@/features/log-media/session/state';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';

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
        variant="log"
      />
    </View>
  );
}
