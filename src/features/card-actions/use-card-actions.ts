import { useState } from 'react';

import type { CardCredit } from '@/features/card-actions/card-actions-sheet';
import { haptics } from '@/lib/haptics';
import { dismissKeyboardNow } from '@/lib/keyboard';
import type { NormalizedMediaItem } from '@/types/media';

export function useCardActions() {
  const [item, setItem] = useState<NormalizedMediaItem | null>(null);
  const [credit, setCredit] = useState<CardCredit | null>(null);
  const [open, setOpen] = useState(false);

  function openActions(next: NormalizedMediaItem, nextCredit?: CardCredit) {
    haptics.selection();
    dismissKeyboardNow();
    setItem(next);
    setCredit(nextCredit ?? null);
    setOpen(true);
  }

  return {
    openActions,
    sheetProps: { item, credit, open, onClose: () => setOpen(false) },
  };
}
