import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { DIARY_QUERY_ROOTS } from '@/state/queries/diary-cache';
import { SEARCH_QUERY_ROOTS } from '@/state/queries/search-cache';
import { exchangeCodeForSession } from '@/lib/providers/trakt/auth';
import type { TokenStore, TraktDeps } from '@/lib/providers/trakt/deps';
import {
  getMediaImages,
  getShowSeasons,
  getShowWatchedProgress,
  getTrendingMovies,
  getTrendingShows,
  getViewerUsername,
  getWatchedMovies,
  getWatchedShows,
  searchMedia,
} from '@/lib/providers/trakt/reads';
import type { NormalizedMediaImages } from '@/lib/providers/trakt/normalize';
import type { MediaType, NormalizedMediaItem } from '@/types/media';
import type { ProviderSession } from '@/types/session';
import { useConnectedProviders } from '@/state/session';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import {
  getClientIdForProvider,
  getClientSecretForProvider,
} from '@/state/session/provider-config';

// Module-level singleton (not rebuilt per traktDeps() call): the auth layer
// coalesces concurrent token refreshes per token store, so the store's object
// identity must be stable across queries.
const tokenStore: TokenStore = {
  get: () => getProviderSession('trakt'),
  set: (session) => setProviderSession('trakt', session),
  clear: () => clearProviderSession('trakt'),
};

/**
 * Real dependency wiring for Trakt effects. Lives in the query layer so the
 * dependency arrow stays state → lib/providers (deps.ts defines the interface,
 * lib/providers never imports state/).
 */
export function traktDeps(): TraktDeps {
  return {
    fetch: httpFetch,
    tokens: tokenStore,
    clientId: getClientIdForProvider('trakt'),
    clientSecret: getClientSecretForProvider('trakt'),
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
  /** The connected account itself — cached forever; disconnect purges the
   *  whole `['trakt']` root, so a reconnect as another user can't reuse it. */
  viewer: () => [...traktQueryKeys.all, 'viewer'] as const,
  watchedShows: () => [...traktQueryKeys.all, 'watched-shows'] as const,
  watchedMovies: () => [...traktQueryKeys.all, 'watched-movies'] as const,
  /** Per-log watch history — the Trakt diary source (plan 0016). Derived from
   *  the shared root so the details-screen diary cache scan stays in sync. */
  history: () => [...DIARY_QUERY_ROOTS.trakt],
  trendingMovies: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-movies', limit ?? 'default'] as const,
  trendingShows: (limit?: number) =>
    [...traktQueryKeys.all, 'trending-shows', limit ?? 'default'] as const,
  /** Prefix for every search entry — details/[id] scans this for cache hits.
   *  Shared root so `search-cache.ts`'s scan can't drift from this key. */
  searchRoot: () => [...SEARCH_QUERY_ROOTS.trakt],
  search: (query: string, limit: number) =>
    [...traktQueryKeys.searchRoot(), query, limit] as const,
  /** Full seasons + episodes for one show (plan 0010). */
  seasons: (traktId: number) =>
    [...traktQueryKeys.all, 'seasons', traktId] as const,
  /** Per-episode watched completion for one show (plan 0010). */
  showProgress: (traktId: number) =>
    [...traktQueryKeys.all, 'show-progress', traktId] as const,
  /** Lazy poster/backdrop recovery for artless watched items. */
  images: (type: MediaType, traktId: number) =>
    [...traktQueryKeys.all, 'images', type, traktId] as const,
  /**
   * One `/calendars/my/*` window (plan 0030). The start date is part of the
   * key on purpose: it is the user's *local* today, so the cache rolls over at
   * local midnight instead of serving yesterday's week to whoever left the app
   * open overnight. `type` is Trakt's own calendar segment.
   */
  myCalendar: (
    type: 'shows' | 'movies' | 'streaming' | 'dvd',
    startDate: string,
    days: number,
  ) => [...traktQueryKeys.myCalendarRoot(), type, startDate, days] as const,
  /**
   * Prefix over every `/calendars/my/*` window (plan 0031 KTD-5). A write path
   * cannot know the `startDate`/`days` the key above carries — they are
   * computed from the user's local today inside `calendarRange()`
   * (`up-next.ts`) — so naming a per-window key from an invalidation would be
   * a bug that silently refreshes nothing. Invalidate the prefix instead.
   */
  myCalendarRoot: () => [...traktQueryKeys.all, 'my-calendar'] as const,
  /**
   * Prefix over every watchlist read, whatever type/sort it was keyed by (plan
   * 0031 U11) — the same shape, and the same reason, as `myCalendarRoot()`: a
   * write path knows the item, never the sort the surface happened to request,
   * so an invalidation names the prefix.
   */
  watchlistRoot: () => [...traktQueryKeys.all, 'watchlist'] as const,
  /** One `/sync/watchlist/{type}/{sortBy}/{sortHow}` read. */
  watchlist: (
    type: 'all' | 'movies' | 'shows',
    sortBy: 'rank' | 'added' | 'released' | 'title',
    sortHow: 'asc' | 'desc',
  ) => [...traktQueryKeys.watchlistRoot(), type, sortBy, sortHow] as const,
};

/**
 * Poster/backdrop for one item, recovered lazily: Trakt's 2026-06-30 API
 * change removed images from `/sync/watched/*`, so items sourced from the
 * watched feed arrive with an empty `coverImage`. Only those items trigger the
 * per-item catalogue fetch — trending/search items already carry art and
 * resolve without a request. Art never churns, so the cache entry never goes
 * stale (docs/solutions/trakt-watched-endpoints-2026-api-changes.md).
 */
export function useTraktMediaImages(
  item: NormalizedMediaItem | undefined,
): NormalizedMediaImages {
  const traktId = item?.externalIds.trakt;
  const type = item?.type ?? 'MOVIE';
  const missingArt = item != null && item.coverImage === '';
  const { data } = useQuery({
    queryKey: traktQueryKeys.images(type, traktId ?? -1),
    queryFn: () =>
      Effect.runPromise(
        getMediaImages(traktDeps(), { type, traktId: traktId ?? -1 }),
      ),
    enabled: missingArt && traktId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (item == null || item.coverImage !== '') {
    return {
      coverImage: item?.coverImage ?? '',
      ...(item?.backdropImage != null
        ? { backdropImage: item.backdropImage }
        : {}),
    };
  }
  return data ?? { coverImage: '' };
}

/**
 * Full seasons + episodes for one show (plan 0010). Public catalogue call, so
 * it suspends regardless of whether Trakt is connected — seasons render even
 * for a not-yet-connected user (without watch checkmarks). Mount under a
 * `SuspenseSection`, only once the trakt id is known.
 */
export function useSuspenseTraktShowSeasonsQuery(params: { traktId: number }) {
  const { traktId } = params;
  return useSuspenseQuery({
    queryKey: traktQueryKeys.seasons(traktId),
    queryFn: () => Effect.runPromise(getShowSeasons(traktDeps(), { traktId })),
  });
}

/**
 * Non-suspense variant sharing the same cache key as the suspense hook above —
 * the series-runtime stat tile reads the resolved structure without forcing the
 * whole detail screen to wait on it; the suspense section drives the fetch.
 */
export function useTraktShowSeasonsQuery(params: {
  traktId: number;
  enabled?: boolean;
}) {
  const { traktId, enabled = true } = params;
  return useQuery({
    queryKey: traktQueryKeys.seasons(traktId),
    queryFn: () => Effect.runPromise(getShowSeasons(traktDeps(), { traktId })),
    enabled,
  });
}

/**
 * Per-episode watched completion for one show (plan 0010). Disabled until
 * Trakt is connected — the seasons view stays usable without it, just no
 * checkmarks. Not suspense: a loading progress read is fine to drop in async.
 */
export function useTraktShowProgressQuery(params: {
  /** Optional so callers that only learn the id conditionally can still hook. */
  traktId: number | undefined;
  enabled?: boolean;
}) {
  const { traktId, enabled = true } = params;
  return useQuery({
    queryKey: traktQueryKeys.showProgress(traktId ?? -1),
    queryFn: () =>
      Effect.runPromise(
        getShowWatchedProgress(traktDeps(), { traktId: traktId ?? -1 }),
      ),
    enabled: enabled && traktId != null,
  });
}

/**
 * Authenticated read of the user's watched shows. Disabled until Trakt is
 * connected; enabling flips from false → true on OAuth completion, which
 * triggers an automatic fetch.
 */
/**
 * The connected Trakt account's username, for "connected as who" on Manage
 * Trackers. Cached forever: it can't change under a live session, and this is
 * a settings-screen nicety that must not cost a request per visit.
 */
export function useTraktViewerQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: traktQueryKeys.viewer(),
    queryFn: () => Effect.runPromise(getViewerUsername(traktDeps())),
    enabled: options.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

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
