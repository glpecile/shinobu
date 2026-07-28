import {
  useHiddenItems,
  visibleByIds,
  type HiddenItem,
} from '@/state/prefs/hidden-items';
import { useSuspenseUpNextQuery, type UpNextResult } from '@/state/queries/up-next';

import type { UpNextEntry } from './types';

/**
 * What every variant consumes: both sections, already minus the items the user
 * hid, plus the render-time clock their badges are labelled from. One hook so
 * the three comparison variants can't drift in what they filter (R12).
 */
export function useUpNextSections(): UpNextResult {
  const sections = useSuspenseUpNextQuery();
  return {
    ...sections,
    continueWatching: useVisibleEntries(sections.continueWatching),
    calendar: useVisibleEntries(sections.calendar),
  };
}

/**
 * `entries` minus the ones whose item the user hid. Hiding is keyed by *media*
 * id while an entry's own id carries its episode or release kind (so a card
 * re-keys when it advances), so the filter runs over the items and maps back
 * rather than over entry ids. A film therefore loses **both** of its release
 * rows when hidden — they share one item id, and hiding a film means hiding the
 * film, not one of its dates (plan 0030 R8).
 *
 * Returns `entries` itself when nothing was hidden, keeping the identity
 * contract `visibleByIds` documents — this is now a one-liner over that shared
 * filter (plan 0031 KTD-13) rather than a third hand-written copy. Up Next is
 * behaviourally unaffected: an entry contributes exactly one id here, where a
 * merged watchlist entry contributes several.
 */
export function visibleEntries(
  entries: UpNextEntry[],
  hidden: readonly HiddenItem[],
): UpNextEntry[] {
  return visibleByIds(entries, hidden, (entry) => [entry.item.id]);
}

function useVisibleEntries(entries: UpNextEntry[]): UpNextEntry[] {
  return visibleEntries(entries, useHiddenItems());
}
