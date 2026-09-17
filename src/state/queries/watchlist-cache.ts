import type { QueryClient } from '@tanstack/react-query';

import { watchlistMergeKeys } from '@/features/watchlist/compute';
import type { NormalizedMediaItem } from '@/types/media';

import { cachedDiaryEntries } from './diary-pages';

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

/**
 * The Letterboxd-sourced twin of `item` (a `letterboxd-<slug>` item) from the
 * cached watchlist gather or diary pages, for the details variants row.
 * Cache-only by necessity, not choice: Letterboxd film pages sit behind the
 * Cloudflare wall and the web relay is username-locked, so a slug can't be
 * looked up — it is known only where the user's own Letterboxd surfaces
 * already carried it. Matched by the watchlist merge's own keys (tmdb, imdb,
 * title|year), so it pairs exactly what the merged grid pairs.
 */
export function findLetterboxdTwinInCache(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
): NormalizedMediaItem | undefined {
  const keys = new Set(watchlistMergeKeys(item));
  if (keys.size === 0) return undefined;
  const candidates = [
    ...queryClient
      .getQueriesData<{ inputs?: Array<{ item: NormalizedMediaItem; source?: string }> }>({
        queryKey: WATCHLIST_QUERY_ROOT,
      })
      .flatMap(([, data]) => data?.inputs ?? [])
      .filter((input) => input?.source === 'letterboxd')
      .map((input) => input.item),
    ...cachedDiaryEntries(queryClient)
      .filter((entry) => entry?.provider === 'letterboxd')
      .map((entry) => entry.item),
  ];
  return candidates.find(
    (twin) => twin?.externalIds?.letterboxd != null && watchlistMergeKeys(twin).some((key) => keys.has(key)),
  );
}
