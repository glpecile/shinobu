import { useVisibleItems } from '@/state/prefs/hidden-items';
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
 * `useVisibleItems` filters by media id; an entry's own id carries its episode
 * (so a card re-keys when it advances), so the filter is applied to the items
 * and mapped back rather than run over entry ids.
 */
function useVisibleEntries(entries: UpNextEntry[]): UpNextEntry[] {
  const visible = useVisibleItems(entries.map((entry) => entry.item));
  if (visible.length === entries.length) return entries;
  const visibleIds = new Set(visible.map((item) => item.id));
  return entries.filter((entry) => visibleIds.has(entry.item.id));
}
