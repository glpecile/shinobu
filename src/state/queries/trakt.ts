import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { exchangeCodeForSession } from '@/lib/providers/trakt/auth';
import { traktClientSecret } from '@/lib/providers/trakt/config';
import type { TokenStore, TraktDeps } from '@/lib/providers/trakt/deps';
import {
  getMediaPeople,
  getMediaStudios,
  getTrendingMovies,
  getTrendingShows,
  getWatchedMovies,
  getWatchedShows,
  searchMedia,
} from '@/lib/providers/trakt/reads';
import type { MediaType, NormalizedMediaItem } from '@/types/media';
import type { ProviderSession } from '@/types/session';
import { useConnectedProviders } from '@/state/session';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import { getClientIdForProvider } from '@/state/session/provider-config';

/**
 * Real dependency wiring for Trakt effects. Lives in the query layer so the
 * dependency arrow stays state → lib/providers (deps.ts defines the interface,
 * lib/providers never imports state/).
 */
export function traktDeps(): TraktDeps {
  const tokenStore: TokenStore = {
    get: () => getProviderSession('trakt'),
    set: (session) => setProviderSession('trakt', session),
    clear: () => clearProviderSession('trakt'),
  };

  return {
    fetch: httpFetch,
    tokens: tokenStore,
    clientId: getClientIdForProvider('trakt'),
    clientSecret: traktClientSecret(),
  };
}

/**
 * Authorization-code → session exchange, run at the Effect boundary so
 * components and session hooks never touch Effect directly (AGENTS.md
 * containment rule). Persists the session on success, which flips
 * `useConnectedProviders` for every subscriber.
 */
export function exchangeTraktCode(params: {
  code: string;
  redirectUri: string;
}): Promise<ProviderSession> {
  return Effect.runPromise(exchangeCodeForSession(traktDeps(), params));
}

export const traktQueryKeys = {
  all: ['trakt'] as const,
  watchedShows: () => [...traktQueryKeys.all, 'watched-shows'] as const,
  watchedMovies: () => [...traktQueryKeys.all, 'watched-movies'] as const,
  trendingMovies: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-movies', limit ?? 'default'] as const,
  trendingShows: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-shows', limit ?? 'default'] as const,
  /** Prefix for every search entry — details/[id] scans this for cache hits. */
  searchRoot: () => [...traktQueryKeys.all, 'search'] as const,
  search: (query: string, limit: number) =>
    [...traktQueryKeys.searchRoot(), query, limit] as const,
  people: (type: MediaType, traktId: number) =>
    [...traktQueryKeys.all, 'people', type, traktId] as const,
  studios: (type: MediaType, traktId: number) =>
    [...traktQueryKeys.all, 'studios', type, traktId] as const,
};

/**
 * Cast + crew credits for one movie/show — public read. Suspense variant:
 * mount it under a `SuspenseSection` (skeleton fallback + error containment),
 * and only once the Trakt id is known — suspense queries can't be disabled.
 */
export function useSuspenseTraktPeopleQuery(params: {
  type: MediaType;
  traktId: number;
}) {
  const { type, traktId } = params;
  return useSuspenseQuery({
    queryKey: traktQueryKeys.people(type, traktId),
    queryFn: () =>
      Effect.runPromise(getMediaPeople(traktDeps(), { type, traktId })),
  });
}

/** Production studios for one movie/show — same suspense contract as above. */
export function useSuspenseTraktStudiosQuery(params: {
  type: MediaType;
  traktId: number;
}) {
  const { type, traktId } = params;
  return useSuspenseQuery({
    queryKey: traktQueryKeys.studios(type, traktId),
    queryFn: () =>
      Effect.runPromise(getMediaStudios(traktDeps(), { type, traktId })),
  });
}

/**
 * Authenticated read of the user's watched shows. Disabled until Trakt is
 * connected; enabling flips from false → true on OAuth completion, which
 * triggers an automatic fetch.
 */
export function useWatchedShowsQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: traktQueryKeys.watchedShows(),
    queryFn: () => Effect.runPromise(getWatchedShows(traktDeps())),
    enabled: options.enabled,
  });
}

/**
 * Authenticated read of the user's watched movies — same enable-on-connect
 * contract as `useWatchedShowsQuery`.
 */
export function useWatchedMoviesQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: traktQueryKeys.watchedMovies(),
    queryFn: () => Effect.runPromise(getWatchedMovies(traktDeps())),
    enabled: options.enabled,
  });
}

export interface TraktWatchedInfo {
  plays: number;
  lastWatchedAt: string;
}

/**
 * Whether Trakt already records this item as watched. Movie-like items (movies
 * and anime films — the same `isFilm` reasoning as log routing) resolve
 * against watched movies, where `plays` is the rewatch count; TV resolves
 * against watched shows, where `plays` is the watched-episode count. Returns
 * `null` while Trakt is disconnected, the read is still loading, or the item
 * simply isn't watched.
 */
export function useTraktWatchedInfo(
  item: NormalizedMediaItem,
): TraktWatchedInfo | null {
  const connected = useConnectedProviders();
  const traktConnected = connected.includes('trakt');
  const movieLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);

  const watchedMovies = useWatchedMoviesQuery({
    enabled: traktConnected && movieLike,
  });
  const watchedShows = useWatchedShowsQuery({
    enabled: traktConnected && item.type === 'TV',
  });

  const traktId = item.externalIds.trakt;
  if (!traktConnected || traktId == null) return null;

  const source = movieLike
    ? watchedMovies.data
    : item.type === 'TV'
      ? watchedShows.data
      : undefined;
  const match = source?.find((entry) => entry.externalIds.trakt === traktId);
  if (match == null || match.currentProgress <= 0) return null;

  return { plays: match.currentProgress, lastWatchedAt: match.lastUpdated };
}

/** One-character queries return noise and burn rate limit — don't fire them. */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Public movie/show text search (plan 0009). Disabled until the trimmed query
 * reaches the minimum length; `keepPreviousData` keeps the last results on
 * screen between debounced queries instead of flashing an empty list.
 */
export function useTraktSearchQuery(params: {
  query: string;
  limit?: number;
}) {
  const query = params.query.trim();
  const limit = params.limit ?? 20;
  return useQuery({
    queryKey: traktQueryKeys.search(query, limit),
    queryFn: () => Effect.runPromise(searchMedia(traktDeps(), { query, limit })),
    enabled: query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * Public catalogue read — works without a session so the feed isn't empty
 * before the user connects any provider (plan.md 2.1, AGENTS.md read path).
 */
export function useTrendingMoviesQuery(options: { limit?: number } = {}) {
  const limit = options.limit ?? 30;
  return useQuery({
    queryKey: traktQueryKeys.trendingMovies(limit),
    queryFn: () => Effect.runPromise(getTrendingMovies(traktDeps(), { limit })),
  });
}

/**
 * Public catalogue read for trending TV shows — no session required.
 */
export function useTrendingShowsQuery(options: { limit?: number } = {}) {
  const limit = options.limit ?? 30;
  return useQuery({
    queryKey: traktQueryKeys.trendingShows(limit),
    queryFn: () => Effect.runPromise(getTrendingShows(traktDeps(), { limit })),
  });
}
