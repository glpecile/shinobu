import { useState } from 'react';

import { haptics } from '@/lib/haptics';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Shared wiring for the per-card actions dialog (quick log / view details /
 * hide). Every card surface — the home feed plus the person and studio
 * filmographies — needs the same moving parts: the `openActions` handler passed
 * to a card row's `onItemActions`, and the `item`/`open`/`onClose` props for one
 * `CardActionsSheet`. Spread `sheetProps` straight onto the sheet:
 *
 *   const { openActions, sheetProps } = useCardActions();
 *   …onItemActions={openActions}…
 *   <CardActionsSheet {...sheetProps} />
 *
 * `item` is kept (not nulled) while closing so its content doesn't vanish
 * mid-animation.
 */
export function useCardActions() {
  const [item, setItem] = useState<NormalizedMediaItem | null>(null);
  const [open, setOpen] = useState(false);

  function openActions(next: NormalizedMediaItem) {
    haptics.selection();
    setItem(next);
    setOpen(true);
  }

  return {
    openActions,
    sheetProps: { item, open, onClose: () => setOpen(false) },
  };
}
