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

import {
  anilistQueryKeys,
  fetchCurrentAnime,
  fetchTrendingAnime,
} from './anilist';
import { traktDeps, traktQueryKeys } from './trakt';

/** One named row of the home feed — never index into the query array. */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'trendingAnime'
  | 'yourShows'
  | 'yourAnime';

export interface UnifiedFeedResult {
  /** Public trending catalogues — always fetched, feed is never empty. */
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  trendingAnime: NormalizedMediaItem[];
  /** Personal in-progress rows from connected providers. */
  yourShows: NormalizedMediaItem[];
  yourAnime: NormalizedMediaItem[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ provider: ProviderId; error: Error }>;
  /** Refetches every feed query in parallel; resolves once all settle. */
  refetch: () => Promise<unknown>;
}

interface FeedQueryConfig {
  slot: FeedSlot;
  provider: ProviderId;
  queryKey: readonly unknown[];
  queryFn: () => Promise<NormalizedMediaItem[]>;
}

/**
 * Aggregates every connected, read-capable provider into one normalized feed
 * (plan.md 2.1): Trakt (todos/001) and AniList (todos/002) today. Public
 * trending catalogues are always included so the feed is never empty before
 * connection. Results are keyed by named slot, not array position — the
 * query list is conditional in two dimensions now.
 */
export function useUnifiedFeed(): UnifiedFeedResult {
  const connected = useConnectedProviders();
  const feedProviders = providersForFeed(connected);

  const queries: FeedQueryConfig[] = [
    // Public catalogues — no session required.
    {
      slot: 'trendingMovies',
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingMovies(),
      queryFn: () => Effect.runPromise(getTrendingMovies(traktDeps())),
    },
    {
      slot: 'trendingShows',
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingShows(),
      queryFn: () => Effect.runPromise(getTrendingShows(traktDeps())),
    },
    {
      slot: 'trendingAnime',
      provider: 'anilist',
      queryKey: anilistQueryKeys.trendingAnime(),
      queryFn: () => fetchTrendingAnime(),
    },
  ];

  if (feedProviders.includes('trakt')) {
    queries.push({
      slot: 'yourShows',
      provider: 'trakt',
      queryKey: traktQueryKeys.watchedShows(),
      queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
    });
  }
  if (feedProviders.includes('anilist')) {
    queries.push({
      slot: 'yourAnime',
      provider: 'anilist',
      queryKey: anilistQueryKeys.currentAnime(),
      queryFn: fetchCurrentAnime,
    });
  }

  const results = useQueries({ queries });

  const bySlot = (slot: FeedSlot): NormalizedMediaItem[] => {
    const index = queries.findIndex((query) => query.slot === slot);
    return (index >= 0 ? results[index]?.data : undefined) ?? [];
  };

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
    trendingMovies: bySlot('trendingMovies'),
    trendingShows: bySlot('trendingShows'),
    trendingAnime: bySlot('trendingAnime'),
    yourShows: bySlot('yourShows'),
    yourAnime: bySlot('yourAnime'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
