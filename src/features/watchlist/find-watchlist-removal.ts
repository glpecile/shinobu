import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';

import { computeWatchlist, watchlistMergeKeys } from './compute';
import type { WatchlistEntry, WatchlistInputs } from './types';

/** What `WatchlistRemovePicker` needs, read out of one gathered cache entry. */
export interface WatchlistRemovalTarget {
  entry: WatchlistEntry;
  errors: ProviderFailure[];
  incomplete: ProviderId[];
}

/**
 * The merged `WatchlistEntry` for `item`, out of the gathered inputs — what
 * lets a surface that only holds an item (the details screen) offer the same
 * removal the `/watchlist` grid does (plan 0033 follow-up, owner request
 * 2026-07-30). Recognition is `isWatchlistedIn`'s, applied input-by-input and
 * then mapped to the merged row via `sourceIds`: matching against the merged
 * item alone would miss keys only a losing input carried (a Letterboxd row's
 * title|year under a Trakt precedence winner).
 *
 * Pure — the caller reads the cache (`watchlistQueryKeys.inputs()`) and hands
 * the data in, so a cold cache is `null` at the call site, never a fetch here
 * (the same never-fetch discipline as `useIsWatchlisted`).
 */
export function findWatchlistRemoval(
  data: WatchlistInputs,
  item: NormalizedMediaItem,
): WatchlistRemovalTarget | null {
  const keys = new Set(watchlistMergeKeys(item));
  const match = data.inputs.find(
    (input) =>
      input.item.id === item.id ||
      (keys.size > 0 &&
        watchlistMergeKeys(input.item).some((key) => keys.has(key))),
  );
  if (match == null) return null;

  const entry = computeWatchlist(data.inputs).find((candidate) =>
    candidate.sourceIds.includes(match.item.id),
  );
  if (entry == null) return null;

  return { entry, errors: data.errors, incomplete: data.incomplete };
}
