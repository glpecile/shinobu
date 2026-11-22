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
export function useUpNextSections(now: Date): UpNextResult {
  const sections = useSuspenseUpNextQuery(now);
  return {
    ...sections,
    continueWatching: useVisibleEntries(sections.continueWatching),
    calendar: useVisibleEntries(sections.calendar),
  };
}

/**
 * `entries` minus the ones whose item the user hid. Hiding is keyed by *media*
 * id while an entry's own id carries its episode or release kind. Continue
 * Watching keys cards by item id, so advancing an episode doesn't re-key them.
 * The filter runs over the items and maps back
 * rather than over entry ids. A film therefore loses **every** release row
 * when hidden — the rows share one item id, or carry the copies a collapse
 * joined in `twinIds`, and hiding a film means hiding the film, not one of its
 * dates (plan 0030 R8).
 *
 * Returns `entries` itself when nothing was hidden, keeping the identity
 * contract `visibleByIds` documents (plan 0031 KTD-13). Like a merged watchlist
 * entry, an entry is hidden when any provider copy folded into it is: its own
 * item id or a `twinIds` one.
 */
export function visibleEntries(
  entries: UpNextEntry[],
  hidden: readonly HiddenItem[],
): UpNextEntry[] {
  return visibleByIds(entries, hidden, (entry) => [entry.item.id, ...(entry.twinIds ?? [])]);
}

function useVisibleEntries(entries: UpNextEntry[]): UpNextEntry[] {
  return visibleEntries(entries, useHiddenItems());
}
