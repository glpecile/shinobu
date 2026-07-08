import { useQueries } from '@tanstack/react-query';
import { Effect } from 'effect';

import { providersForFeed } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import {
  getTrendingMovies,
  getTrendingShows,
  getWatchedShows,
} from '@/lib/providers/trakt/reads';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { traktDeps, traktQueryKeys } from './trakt';

export interface UnifiedFeedResult {
  /** Public trending movies — always fetched. */
  trendingMovies: NormalizedMediaItem[];
  /** Public trending TV shows — always fetched. */
  trendingShows: NormalizedMediaItem[];
  /** Personal in-progress items from connected providers. */
  feedItems: NormalizedMediaItem[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ provider: ProviderId; error: Error }>;
  /** Refetches every feed query in parallel; resolves once all settle. */
  refetch: () => Promise<unknown>;
}

interface FeedQueryConfig {
  provider: ProviderId;
  queryKey: readonly unknown[];
  queryFn: () => Promise<NormalizedMediaItem[]>;
}

/**
 * Aggregates every connected, read-capable provider into one normalized list.
 * Today that is only Trakt (`todos/001`); AniList (`todos/002`) will add a second
 * parallel query here. A public trending catalogue is always included so the feed
 * is never empty before connection.
 */
export function useUnifiedFeed(): UnifiedFeedResult {
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);

  const queries: FeedQueryConfig[] = [
    // Public catalogues — no session required.
    {
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingMovies(),
      queryFn: () => Effect.runPromise(getTrendingMovies(traktDeps())),
    },
    {
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingShows(),
      queryFn: () => Effect.runPromise(getTrendingShows(traktDeps())),
    },
  ];

  if (feedProviders.includes('trakt')) {
    queries.push({
      provider: 'trakt',
      queryKey: traktQueryKeys.watchedShows(),
      queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
    });
  }

  const results = useQueries({ queries });

  // Index 0: trending movies; index 1: trending shows; index 2: watched feed
  // when Trakt is connected.
  const trendingMovies = results[0]?.data ?? [];
  const trendingShows = results[1]?.data ?? [];
  const feedItems = results[2]?.data ?? [];
  const isLoading = results.some((result) => result.isLoading);
  const isError = results.some((result) => result.isError);

  const errors = results
    .map((result, index) => ({
      provider: queries[index].provider,
      error: result.error,
    }))
    .filter(
      (entry): entry is { provider: ProviderId; error: Error } =>
        entry.error != null,
    );

  function refetch() {
    // allSettled, not all: one provider failing to refresh must not hide the
    // outcome of the others (partial-failure contract, AGENTS.md).
    return Promise.allSettled(results.map((result) => result.refetch()));
  }

  return {
    trendingMovies,
    trendingShows,
    feedItems,
    isLoading,
    isError,
    errors,
    refetch,
  };
}
