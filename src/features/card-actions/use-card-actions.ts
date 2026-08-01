import { useState } from 'react';

import type { PersonCredit } from '@/features/person';
import { haptics } from '@/lib/haptics';
import type { NormalizedMediaItem } from '@/types/media';

/** What `CardActionsSheet`'s credit line needs — see its `credit` prop. */
type CardCredit = Pick<PersonCredit, 'name' | 'headshot' | 'role' | 'kind'>;

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
  const [credit, setCredit] = useState<CardCredit | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * `credit` is the filmography context (whose page this is, and their role on
   * the item) — passed by `/person`, omitted everywhere else.
   */
  function openActions(next: NormalizedMediaItem, nextCredit?: CardCredit) {
    haptics.selection();
    setItem(next);
    setCredit(nextCredit ?? null);
    setOpen(true);
  }

  return {
    openActions,
    sheetProps: { item, credit, open, onClose: () => setOpen(false) },
  };
}
