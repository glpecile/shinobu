import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
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
  getWatchedShows,
} from '@/lib/providers/trakt/reads';
import type { MediaType } from '@/types/media';
import type { ProviderSession } from '@/types/session';
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
  trendingMovies: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-movies', limit ?? 'default'] as const,
  trendingShows: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-shows', limit ?? 'default'] as const,
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
