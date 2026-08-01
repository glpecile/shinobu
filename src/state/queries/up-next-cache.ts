import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedMediaItem } from '@/types/media';

/**
 * The Up Next query root, in its own module for the same reason
 * `diary-cache.ts` and `search-cache.ts` exist: two modules need it and they
 * can't import each other. `state/queries/up-next.ts` builds its keys from it,
 * and `state/session` purges it on disconnect — importing the key builder
 * there directly would close a cycle, since `up-next.ts` reads the session.
 *
 * Why disconnect has to purge it at all: unlike every provider read, this key
 * carries *both* providers' inputs under one entry that doesn't name either of
 * them, so `removeQueries({ queryKey: [providerId] })` can't reach it. In
 * memory that was 60 seconds of staleness; persisted (`persist.ts`) it would
 * be a disconnected provider's data sitting on disk until `maxAge`.
 */
export const UP_NEXT_QUERY_ROOT = ['up-next'] as const;

/**
 * Resolves an Up Next / Continue Watching card's item out of the cached
 * gather — the details screen's resolution chain, beside its
 * `findInWatchlistCache` / `findInDiaryCache` / `findInSearchCache` siblings.
 *
 * These cards used to resolve incidentally, by riding the `yourShows` and
 * `yourAnime` feed slots: the same show was in both surfaces, so the feed's
 * copy answered. Removing those two rows (owner, 2026-08-01 — "these will be
 * replaced with the watchlist anyway") took that copy away, which would have
 * turned every Continue Watching tap on a show that isn't also watchlisted
 * into "Not found". Up Next's own inputs are the honest source for its own
 * cards.
 *
 * Cache-only and synchronous, like its siblings — opening a details screen
 * must never trigger the gather. `input?.item?.id` for the reason spelled out
 * in `watchlist-cache.ts`: the root is a prefix, so a future sibling key with
 * a different row shape must degrade to "Not found", never throw.
 */
export function findInUpNextCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{
      progress?: Array<{ item: NormalizedMediaItem }>;
      calendar?: Array<{ item: NormalizedMediaItem }>;
      releases?: Array<{ item: NormalizedMediaItem }>;
    }>({ queryKey: UP_NEXT_QUERY_ROOT })
    .flatMap(([, data]) => [
      ...(data?.progress ?? []),
      ...(data?.calendar ?? []),
      ...(data?.releases ?? []),
    ])
    .find((input) => input?.item?.id === id)?.item;
}
