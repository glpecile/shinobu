import { skipToken, useQuery } from '@tanstack/react-query';

import { watchlistQueryKeys, type WatchlistInputs } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

import { watchlistMergeKeys } from './compute';
import type { WatchlistInput } from './types';

/**
 * Whether `item` is on any gathered watchlist row — **the same key derivation
 * the merge itself uses** (`watchlistMergeKeys`), so "is this the same film" is
 * answered by one function and not by two that can drift. That matters
 * concretely: the details screen opens a TMDB-sourced item whose id will never
 * equal the `letterboxd-<slug>` on the watchlist row, and only the shared key
 * derivation recognises them as the same film.
 *
 * Pure, so the recognition rules are unit-testable without a query client.
 */
export function isWatchlistedIn(
  inputs: readonly WatchlistInput[],
  item: NormalizedMediaItem,
): boolean {
  const keys = new Set(watchlistMergeKeys(item));
  if (keys.size === 0) return inputs.some((input) => input.item.id === item.id);
  return inputs.some(
    (input) =>
      input.item.id === item.id ||
      watchlistMergeKeys(input.item).some((key) => keys.has(key)),
  );
}

/**
 * Three-state membership for one item (plan 0031 R31): `true` → it is on a
 * watchlist; `false` → it is not; `undefined` → **unknown**, because the
 * watchlist surface has never been opened in this session and the cache is
 * cold. Callers render `undefined` as today's behaviour ("Add to watchlist"),
 * never as a claim of absence.
 *
 * **It is cache-only and must never fetch.** `skipToken` is what guarantees
 * that: the observer subscribes to the already-populated
 * `watchlistQueryKeys.inputs()` entry and can issue no request, so an
 * invalidation of that key never turns into a fetch from here either. An
 * item-level membership *read* is exactly the per-item cost KTD-3 rejected —
 * one request per card, N+1 against every provider's rate budget — and nothing
 * here re-opens it. If a caller ever needs a warm answer, the fix is to open
 * (or prefetch) the surface, not to fetch per item.
 */
export function useIsWatchlisted(
  item: NormalizedMediaItem | undefined,
): boolean | undefined {
  const { data } = useQuery<WatchlistInputs>({
    queryKey: watchlistQueryKeys.inputs(),
    queryFn: skipToken,
  });
  if (data == null || item == null) return undefined;
  return isWatchlistedIn(data.inputs, item);
}
