import { useHiddenItems, visibleByIds } from '@/state/prefs/hidden-items';
import {
  useSuspenseWatchlistInputsQuery,
  type WatchlistInputs,
} from '@/state/queries/watchlist';
import { useMangaListQuery } from '@/state/queries/anilist';

import { computeWatchlist } from './compute';
import type { WatchlistEntry } from './types';

export interface WatchlistResult {
  entries: WatchlistEntry[];
  errors: WatchlistInputs['errors'];
  incomplete: WatchlistInputs['incomplete'];
}

export function useSuspenseWatchlistQuery(): WatchlistResult {
  const data = useSuspenseWatchlistInputsQuery();
  const mangaList = useMangaListQuery({ fetch: false });
  return {
    entries: useVisibleWatchlistEntries(computeWatchlist(data.inputs, mangaList)),
    errors: data.errors,
    incomplete: data.incomplete,
  };
}

export function useVisibleWatchlistEntries(entries: WatchlistEntry[]): WatchlistEntry[] {
  return visibleByIds(entries, useHiddenItems(), (entry) => entry.sourceIds);
}
