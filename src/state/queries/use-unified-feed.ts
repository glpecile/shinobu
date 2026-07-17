import { useQueries, useQueryClient } from '@tanstack/react-query';
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
  animeSeasonAt,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { getWatchlist } from '@/lib/providers/letterboxd/watchlist';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import {
  anilistQueryKeys,
  fetchCurrentAnime,
  fetchSeasonalAnime,
} from './anilist';
import {
  letterboxdDeps,
  letterboxdQueryKeys,
  letterboxdReadsAvailable,
} from './letterboxd';
import { traktDeps, traktQueryKeys } from './trakt';

/** One named row of the home feed — never index into the query array. */
type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'yourShows'
  | 'yourAnime'
  | 'yourWatchlist';

export interface UnifiedFeedResult {
  /** Public trending catalogues — always fetched, feed is never empty. */
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  /** Popular anime of the current cour (e.g. Summer 2026). */
  seasonalAnime: NormalizedMediaItem[];
  /** Which cour `seasonalAnime` covers — drives the row's title. */
  animeSeason: AnimeSeasonWindow;
  /** Personal in-progress rows from connected providers. */
  yourShows: NormalizedMediaItem[];
  yourAnime: NormalizedMediaItem[];
  /** Letterboxd watchlist (plan 0012) — empty on web, where reads are CORS-blocked. */
  yourWatchlist: NormalizedMediaItem[];
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
  staleTime?: number;
}

/**
 * Public catalogue rows move slowly (trending/popularity rankings, not user
 * state) — a long staleTime keeps home ↔ details navigation from re-spending
 * provider rate budget on every remount (AniList's is 30 req/min,
 * docs/solutions/anilist-rate-limit-retry-storm.md).
 */
const CATALOGUE_STALE_MS = 15 * 60_000;

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
  const queryClient = useQueryClient();
  const animeSeason = animeSeasonAt(new Date());

  const queries: FeedQueryConfig[] = [
    // Public catalogues — no session required.
    {
      slot: 'trendingMovies',
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingMovies(),
      queryFn: () => Effect.runPromise(getTrendingMovies(traktDeps())),
      staleTime: CATALOGUE_STALE_MS,
    },
    {
      slot: 'trendingShows',
      provider: 'trakt',
      queryKey: traktQueryKeys.trendingShows(),
      queryFn: () => Effect.runPromise(getTrendingShows(traktDeps())),
      staleTime: CATALOGUE_STALE_MS,
    },
    {
      slot: 'seasonalAnime',
      provider: 'anilist',
      queryKey: anilistQueryKeys.seasonalAnime(animeSeason),
      queryFn: () => fetchSeasonalAnime(animeSeason),
      staleTime: CATALOGUE_STALE_MS,
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
      queryFn: () => fetchCurrentAnime(queryClient),
    });
  }
  if (feedProviders.includes('letterboxd') && letterboxdReadsAvailable()) {
    // The platform gate also keeps this MMKV read out of web SSR renders
    // (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
    const letterboxdUsername = getLetterboxdUsername();
    if (letterboxdUsername != null) {
      queries.push({
        slot: 'yourWatchlist',
        provider: 'letterboxd',
        queryKey: letterboxdQueryKeys.watchlist(letterboxdUsername),
        queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
      });
    }
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
    seasonalAnime: bySlot('seasonalAnime'),
    animeSeason,
    yourShows: bySlot('yourShows'),
    yourAnime: bySlot('yourAnime'),
    yourWatchlist: bySlot('yourWatchlist'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
