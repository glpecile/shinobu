import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedMediaItem } from '@/types/media';

/**
 * The cross-provider watchlist query root, in its own module for exactly the
 * reason `up-next-cache.ts` exists: `state/queries/watchlist.ts` builds its
 * keys from it and `state/session` purges it on disconnect, and importing the
 * key builder there would close a cycle (the gatherer reads the session).
 *
 * Why disconnect has to purge it: this key holds **every** connected provider's
 * watchlist rows under one entry that names none of them, so
 * `removeQueries({ queryKey: [providerId] })` cannot reach it. It is the
 * **second** violator of "every query root is a provider id" (plan 0031 U13);
 * `UP_NEXT_QUERY_ROOT` was the first. Without the purge, disconnecting Trakt
 * leaves that account's rows in the merged surface for the whole 15-minute
 * stale window — and, since this entry is persisted (`persist.ts`), on disk
 * until `maxAge`.
 */
export const WATCHLIST_QUERY_ROOT = ['watchlist'] as const;

/**
 * Resolves a watchlist card's item out of the cached gather — the details
 * screen's resolution chain (plan 0031 U14) extends here after the diary step.
 *
 * It has to exist: the merged row and grid carry Trakt- and AniList-sourced
 * items that belong to **no feed slot**, no search, no diary and no TMDB cache,
 * and anything the chain cannot resolve renders "Not found". Cache-only and
 * synchronous, like its `findInSearchCache` / `findInDiaryCache` siblings —
 * opening a details screen must never trigger a gather.
 *
 * Matches against **every contributing input**, not the merge's precedence
 * winner: Manage Trackers' hidden list links to a `letterboxd-<slug>` id whose
 * winner is the Trakt twin, and that link must not 404 either.
 */
export function findInWatchlistCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{ inputs?: Array<{ item: NormalizedMediaItem }> }>({
      queryKey: WATCHLIST_QUERY_ROOT,
    })
    .flatMap(([, data]) => data?.inputs ?? [])
    // `input?.item?.id`, not `input.item.id`: `WATCHLIST_QUERY_ROOT` is a
    // prefix, so any future sibling key under `['watchlist', …]` gets scanned
    // here too. That exact shape — a prefix root matching a sibling query whose
    // rows have a different shape — is what crashed the details screen through
    // `findInDiaryCache`. A resolution helper must degrade to "Not found",
    // never throw and take the route's ErrorBoundary with it.
    .find((input) => input?.item?.id === id)?.item;
}
