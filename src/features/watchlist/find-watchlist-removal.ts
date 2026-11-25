import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';

import { computeWatchlist, watchlistMergeKeys } from './compute';
import type { WatchlistEntry, WatchlistInputs } from './types';

export interface WatchlistRemovalTarget {
  entry: WatchlistEntry;
  errors: ProviderFailure[];
  incomplete: ProviderId[];
}

export function findWatchlistRemoval(
  data: WatchlistInputs,
  item: NormalizedMediaItem,
  mangaList: readonly NormalizedMediaItem[] = [],
): WatchlistRemovalTarget | null {
  const keys = new Set(watchlistMergeKeys(item));
  const match = data.inputs.find(
    (input) =>
      input.item.id === item.id ||
      (keys.size > 0 &&
        watchlistMergeKeys(input.item).some((key) => keys.has(key))),
  );
  if (match == null) return null;

  const merged = computeWatchlist(data.inputs, mangaList).find((candidate) =>
    candidate.sourceIds.includes(match.item.id),
  );
  if (merged == null) return null;
  const entry: WatchlistEntry =
    merged.item.type === 'BOOK' && match.item.type === 'MANGA'
      ? { ...merged, id: match.item.id, item: match.item, sources: [match.source], sourceIds: [match.item.id] }
      : merged;

  return { entry, errors: data.errors, incomplete: data.incomplete };
}
