import { useHiddenItems, visibleByIds } from '@/state/prefs/hidden-items';
import {
  useSuspenseWatchlistInputsQuery,
  type WatchlistInputs,
} from '@/state/queries/watchlist';

import { computeWatchlist } from './compute';
import type { WatchlistEntry } from './types';

/**
 * What the `/watchlist` grid and the home row consume: the merged entries,
 * already minus the items the user hid, plus whichever legs failed.
 *
 * The merge runs **here, at render time**, not in the `queryFn` — so a hide, or
 * a second Letterboxd page arriving through `onEndReached`, re-merges from the
 * cached inputs without a refetch (the same reasoning `useUpNextSections` uses
 * for its clock).
 */
export interface WatchlistResult {
  entries: WatchlistEntry[];
  /**
   * Legs that failed. The surface renders one inline notice per provider above
   * the wall rather than a `SuspenseSection` per source — a deliberate,
   * argued divergence from AGENTS.md § Loading & Error States (KTD-12): dedupe
   * needs every source in hand before anything can render, so there is no
   * per-source subtree to wrap, and wrapping the whole grid would blank it on
   * one provider's outage. Do not "fix" this back to the default.
   */
  errors: WatchlistInputs['errors'];
}

export function useSuspenseWatchlistQuery(): WatchlistResult {
  const data = useSuspenseWatchlistInputsQuery();
  return {
    entries: useVisibleWatchlistEntries(computeWatchlist(data.inputs)),
    errors: data.errors,
  };
}

/**
 * `entries` minus the ones the user hid — filtered over **every** contributing
 * id, because hidden ids are provider-scoped and a merged entry has several
 * (plan 0031 R30). Filtering on the canonical id alone would let a film hidden
 * from a Letterboxd row reappear as its Trakt twin.
 */
export function useVisibleWatchlistEntries(entries: WatchlistEntry[]): WatchlistEntry[] {
  return visibleByIds(entries, useHiddenItems(), (entry) => entry.sourceIds);
}
