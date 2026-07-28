import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
 * **It is cache-only and must never fetch**, so it is a plain cache
 * subscription and *not* a query observer. An earlier version used
 * `useQuery({ queryFn: skipToken })` on the reasoning that a skipToken observer
 * cannot issue a request. That was wrong in the one case that matters: a
 * skipToken observer is still an **active** observer, so
 * `invalidateAfterWatchlist` invalidating `watchlistQueryKeys.inputs()` asked it
 * to refetch and TanStack threw *"Attempted to invoke queryFn when set to
 * skipToken"* — every watchlist add from a details screen, which is the one
 * surface where the surface's own real observer is not mounted.
 *
 * The deeper rule that mistake broke: **one key, one queryFn.** The surface
 * (`useWatchlistInputsQuery`) owns `inputs()` and has the real gatherer; nobody
 * else may register a second, differently-fetching observer on it. Reading the
 * cache directly is the only honest way to be a passive consumer, and it is
 * structural — there is no queryFn here to invoke, so no invalidation, refetch
 * or retry can reach a network call through this hook.
 *
 * An item-level membership *read* is exactly the per-item cost KTD-3 rejected —
 * one request per card, N+1 against every provider's rate budget — and nothing
 * here re-opens it. If a caller ever needs a warm answer, the fix is to open
 * (or prefetch) the surface, not to fetch per item.
 */
export function useIsWatchlisted(
  item: NormalizedMediaItem | undefined,
): boolean | undefined {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();

  // The snapshot is a primitive (`true | false | undefined`), so it is stable by
  // value and `useSyncExternalStore` cannot loop on a fresh object identity.
  return useSyncExternalStore(
    (onStoreChange) => cache.subscribe(() => onStoreChange()),
    () => {
      if (item == null) return undefined;
      const data = queryClient.getQueryData<WatchlistInputs>(
        watchlistQueryKeys.inputs(),
      );
      return data == null ? undefined : isWatchlistedIn(data.inputs, item);
    },
    // Web SSR has no cache to read; `undefined` is already the "unknown" state
    // callers render as today's behaviour (expo-web-ssr-mmkv-storage-on-server).
    () => undefined,
  );
}
