import {
  useQueries,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import type { SeasonalAnimePage } from '@/lib/providers/anilist/reads';

import { providersForFeed } from '@/lib/providers/routing';
import { getTrending } from '@/lib/providers/simkl/reads';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import {
  animeSeasonAt,
  type AnimeFormatFilter,
  type AnimeSeasonWindow,
} from '@/lib/providers/anilist/season';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { anilistQueryKeys, fetchSeasonalAnime } from './anilist';
import { letterboxdQueryKeys, letterboxdWatchlistOptions } from './letterboxd';
import { simklDeps, simklQueryKeys } from './simkl';
import { serializdQueryKeys } from './serializd';
import { refreshUpNextInputs } from './up-next';
import { refreshWatchlistInputs } from './watchlist';

type FeedSlot =
  | 'trendingMovies'
  | 'trendingShows'
  | 'seasonalAnime'
  | 'animeMovies'
  | 'yourWatchlist';

export interface UnifiedFeedResult {
  trendingMovies: NormalizedMediaItem[];
  trendingShows: NormalizedMediaItem[];
  seasonalAnime: NormalizedMediaItem[];
  animeSeason: AnimeSeasonWindow;
  animeMovies: NormalizedMediaItem[];
  yourWatchlist: NormalizedMediaItem[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ provider: ProviderId; error: Error }>;
  refetch: () => Promise<unknown>;
}

type FeedData = NormalizedMediaItem[] | SeasonalAnimePage;

interface FeedQueryConfig {
  slot: FeedSlot;
  provider: ProviderId;
  queryKey: readonly unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<FeedData>;
  select?: (data: FeedData) => NormalizedMediaItem[];
  staleTime?: number;
}

// AniList's rate limit is 30 req/min (docs/solutions/anilist-rate-limit-retry-storm.md).
const CATALOGUE_STALE_MS = 15 * 60_000;

export const feedOptions = {
  trendingMovies: () => ({
    queryKey: simklQueryKeys.trending('movies'),
    queryFn: ({ signal }: { signal: AbortSignal }) => Effect.runPromise(getTrending(simklDeps(), 'movies'), { signal }),
    staleTime: CATALOGUE_STALE_MS,
  }),
  trendingShows: () => ({
    queryKey: simklQueryKeys.trending('tv'),
    queryFn: ({ signal }: { signal: AbortSignal }) => Effect.runPromise(getTrending(simklDeps(), 'tv'), { signal }),
    staleTime: CATALOGUE_STALE_MS,
  }),
  seasonalAnime: (season: AnimeSeasonWindow, format: AnimeFormatFilter = 'TV') => ({
    queryKey: anilistQueryKeys.seasonalAnime(season, format),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchSeasonalAnime(season, format, 1, signal),
    select: (data: FeedData) => Array.isArray(data) ? data : data.items,
    staleTime: CATALOGUE_STALE_MS,
  }),
  yourWatchlist: (username: string) => letterboxdWatchlistOptions(username),
};

export function hasUpNextSources(connected: readonly ProviderId[]): boolean {
  const feedProviders = providersForFeed(connected);
  return (
    feedProviders.includes(Provider.Trakt) ||
    feedProviders.includes(Provider.Simkl) ||
    feedProviders.includes(Provider.AniList)
  );
}

function activeFeedConfigs(
  connected: readonly ProviderId[],
  queryClient: QueryClient,
  season: AnimeSeasonWindow,
): FeedQueryConfig[] {
  const feedProviders = providersForFeed(connected);
  const configs: FeedQueryConfig[] = [
    { slot: 'trendingMovies', provider: Provider.Simkl, ...feedOptions.trendingMovies() },
    { slot: 'trendingShows', provider: Provider.Simkl, ...feedOptions.trendingShows() },
    {
      slot: 'seasonalAnime',
      provider: Provider.AniList,
      ...feedOptions.seasonalAnime(season, 'TV'),
    },
    {
      slot: 'animeMovies',
      provider: Provider.AniList,
      ...feedOptions.seasonalAnime(season, 'MOVIE'),
    },
  ];

  if (feedProviders.includes(Provider.Letterboxd)) {
    // The `feedProviders` gate also keeps this MMKV read out of web SSR renders
    // (empty in the server snapshot — docs/solutions/expo-web-ssr-mmkv-storage-on-server.md).
    const letterboxdUsername = getLetterboxdUsername();
    if (letterboxdUsername != null) {
      configs.push({
        slot: 'yourWatchlist',
        provider: Provider.Letterboxd,
        ...feedOptions.yourWatchlist(letterboxdUsername),
      });
    }
  }

  return configs;
}

export function useSuspenseTrendingMoviesQuery() {
  return useSuspenseQuery(feedOptions.trendingMovies());
}

export function useSuspenseTrendingShowsQuery() {
  return useSuspenseQuery(feedOptions.trendingShows());
}

export function useSuspenseSeasonalAnimeQuery(
  season: AnimeSeasonWindow,
  format: AnimeFormatFilter = 'TV',
) {
  return useSuspenseQuery(feedOptions.seasonalAnime(season, format));
}

export function useSuspenseAnimeMoviesQuery(season: AnimeSeasonWindow) {
  return useSuspenseQuery(feedOptions.seasonalAnime(season, 'MOVIE'));
}

export function useSuspenseYourWatchlistQuery(username: string) {
  return useSuspenseQuery(feedOptions.yourWatchlist(username));
}

export function useRefetchUnifiedFeed() {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();

  function refetch() {
    const feedProviders = providersForFeed(connected);
    return Promise.allSettled([
      ...(hasUpNextSources(connected) ? [refreshUpNextInputs(queryClient)] : []),
      ...(feedProviders.length > 0 ? [refreshWatchlistInputs(queryClient)] : []),
      ...(feedProviders.includes(Provider.Letterboxd)
        ? [queryClient.invalidateQueries({ queryKey: letterboxdQueryKeys.listsRoot() })]
        : []),
      ...(feedProviders.includes(Provider.Serializd)
        ? [
            queryClient.invalidateQueries({ queryKey: serializdQueryKeys.listsRoot() }),
            queryClient.refetchQueries({ queryKey: [...serializdQueryKeys.all, 'upcoming'], type: 'active' }),
          ]
        : []),
    ]);
  }

  return refetch;
}

/** Cache-only observer of feed rows (`enabled: false`); does not fetch unless `refetch()` is called. */
export function useUnifiedFeed(): UnifiedFeedResult {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const animeSeason = animeSeasonAt(new Date());
  const queries = activeFeedConfigs(connected, queryClient, animeSeason);

  const results = useQueries({ queries: queries.map((query) => ({ ...query, enabled: false })) });

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
    return Promise.allSettled(results.map((result) => result.refetch()));
  }

  return {
    trendingMovies: bySlot('trendingMovies'),
    trendingShows: bySlot('trendingShows'),
    seasonalAnime: bySlot('seasonalAnime'),
    animeSeason,
    animeMovies: bySlot('animeMovies'),
    yourWatchlist: bySlot('yourWatchlist'),
    isLoading,
    isError,
    errors,
    refetch,
  };
}
