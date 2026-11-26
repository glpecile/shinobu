import { useHiddenItems, visibleByIds, type HiddenItem } from '@/state/prefs/hidden-items';
import { withLoggedEpisodes } from '@/features/log-media/optimistic';
import { useLoggedWatches } from '@/features/log-media/logged-context';
import { useSuspenseUpNextQuery, type UpNextResult } from '@/state/queries/up-next';

import type { UpNextEntry } from './types';

export function useUpNextSections(now: Date): UpNextResult {
  const sections = useSuspenseUpNextQuery(now);
  const logged = useLoggedWatches();
  return {
    ...sections,
    continueWatching: useVisibleEntries(withLoggedEpisodes(sections.continueWatching, logged)),
    calendar: useVisibleEntries(sections.calendar),
  };
}

export function visibleEntries(
  entries: UpNextEntry[],
  hidden: readonly HiddenItem[],
): UpNextEntry[] {
  return visibleByIds(entries, hidden, (entry) => [entry.item.id, ...(entry.twinIds ?? [])]);
}

function useVisibleEntries(entries: UpNextEntry[]): UpNextEntry[] {
  return visibleEntries(entries, useHiddenItems());
}
