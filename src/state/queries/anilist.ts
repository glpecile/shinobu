import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { DIARY_QUERY_ROOTS } from '@/state/queries/diary-cache';
import { sessionFromImplicitRedirect } from '@/lib/providers/anilist/auth';
import type { AniListDeps } from '@/lib/providers/anilist/deps';
import { getAnimeEpisodes } from '@/lib/providers/anilist/episodes';
import {
  getCurrentAnime,
  getEntryState,
  getSeasonalAnime,
  getTrendingAnime,
  getViewerId,
  searchMedia,
  type AniListEntryState,
} from '@/lib/providers/anilist/reads';
import type { AnimeSeasonWindow } from '@/lib/providers/anilist/season';
import type { NormalizedSeason } from '@/types/media';
import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import { SEARCH_MIN_QUERY_LENGTH } from './trakt';

// Module-level singleton for the same reason as trakt.ts: effects compare the
// store by identity (and the MMKV listener contract expects one writer path).
const tokenStore: TokenStore = {
  get: () => getProviderSession('anilist'),
  set: (session) => setProviderSession('anilist', session),
  clear: () => clearProviderSession('anilist'),
};

/**
 * Real dependency wiring for AniList effects — the state → lib/providers
 * boundary, mirroring `traktDeps()`.
 */
export function anilistDeps(): AniListDeps {
  return { fetch: httpFetch, tokens: tokenStore };
}

/**
 * Implicit-grant return leg (plan 0011 decision 1): the whole "exchange" is
 * parsing the redirect fragment — no network call. Persisting the session
 * flips `useConnectedProviders` for every subscriber, exactly like Trakt's
 * code exchange does. Returns false for redirects without a usable token
 * (denied/malformed) so callers can surface the failure.
 */
export function connectAniListFromRedirect(url: string): boolean {
  const session = sessionFromImplicitRedirect(url, Date.now());
  if (session == null) return false;
  setProviderSession('anilist', session);
  return true;
}

// Airing schedules shift on the order of days — revisiting a detail screen
// inside this window rides the cache instead of the 30 req/min budget
// (docs/solutions/anilist-rate-limit-retry-storm.md).
const EPISODES_STALE_MS = 5 * 60_000;

export const anilistQueryKeys = {
  all: ['anilist'] as const,
  viewer: () => [...anilistQueryKeys.all, 'viewer'] as const,
  currentAnime: () => [...anilistQueryKeys.all, 'current-anime'] as const,
  trendingAnime: (limit?: number) =>
    [...anilistQueryKeys.all, 'trending-anime', limit ?? 'default'] as const,
  /** Popular anime of one cour — keyed by season so a boundary crossing refetches. */
  seasonalAnime: (window: AnimeSeasonWindow) =>
    [...anilistQueryKeys.all, 'seasonal-anime', window.season, window.year] as const,
  /** The viewer's recorded state for one media — reconcile reads this (plan 0011). */
  entryState: (mediaId: number) =>
    [...anilistQueryKeys.all, 'entry-state', mediaId] as const,
  /** Per-episode air dates + titles for one anime series (detail screen). */
  episodes: (mediaId: number) =>
    [...anilistQueryKeys.all, 'episodes', mediaId] as const,
  /** Public anime + manga text search (search screen's AniList section). */
  search: (query: string, limit: number) =>
    [...anilistQueryKeys.all, 'search', query, limit] as const,
  /** The viewer's media-list activity — the AniList diary source (plan 0016).
   *  Derived from the shared root so the diary cache scan stays in sync. */
  listActivity: () => [...DIARY_QUERY_ROOTS.anilist],
};

/**
 * The viewer's currently-watching list. The viewer-id prefix request is
 * cached forever under its own key (it never changes for a session; the
 * disconnect flow purges it), so steady-state refreshes spend 1 request of
 * the 30/min budget instead of 2. Exposed as a plain promise so
 * `useUnifiedFeed` can consume it as a queryFn.
 */
export async function fetchCurrentAnime(
  queryClient: QueryClient,
): Promise<NormalizedMediaItem[]> {
  const deps = anilistDeps();
  const viewerId = await queryClient.fetchQuery({
    queryKey: anilistQueryKeys.viewer(),
    queryFn: () => Effect.runPromise(getViewerId(deps)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return Effect.runPromise(getCurrentAnime(deps, { viewerId }));
}

export function fetchTrendingAnime(options: { limit?: number } = {}): Promise<NormalizedMediaItem[]> {
  return Effect.runPromise(getTrendingAnime(anilistDeps(), options));
}

/** Popular anime of the given cour ("Summer 2026") — the feed's anime row. */
export function fetchSeasonalAnime(window: AnimeSeasonWindow): Promise<NormalizedMediaItem[]> {
  return Effect.runPromise(
    getSeasonalAnime(anilistDeps(), { season: window.season, year: window.year }),
  );
}

/**
 * Authenticated read of the viewer's watching list — enable-on-connect
 * contract matches `useWatchedShowsQuery`.
 */
export function useCurrentAnimeQuery(options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: anilistQueryKeys.currentAnime(),
    queryFn: () => fetchCurrentAnime(queryClient),
    enabled: options.enabled,
  });
}

/**
 * Public anime/manga text search — the AniList half of the sectioned search
 * screen. Same enable/keepPreviousData/staleTime contract as
 * `useTraktSearchQuery` (the shared minimum-length constant lives there);
 * the 60s staleTime also matters here for the 30 req/min budget
 * (docs/solutions/anilist-rate-limit-retry-storm.md).
 */
export function useAniListSearchQuery(params: {
  query: string;
  limit?: number;
}) {
  const query = params.query.trim();
  const limit = params.limit ?? 20;
  return useQuery({
    queryKey: anilistQueryKeys.search(query, limit),
    queryFn: () =>
      Effect.runPromise(searchMedia(anilistDeps(), { query, limit })),
    enabled: query.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Public trending anime — no session required (plan.md 2.1). */
export function useTrendingAnimeQuery(options: { limit?: number } = {}) {
  const limit = options.limit ?? 30;
  return useQuery({
    queryKey: anilistQueryKeys.trendingAnime(limit),
    queryFn: () => fetchTrendingAnime({ limit }),
  });
}

/**
 * The viewer's recorded state for one AniList media (entry progress/repeat) —
 * drives rewatch copy and the log reconciliation. Disabled until AniList is
 * connected and the item actually has an anilist id.
 */
export function useAniListEntryStateQuery(params: {
  mediaId: number | undefined;
  enabled?: boolean;
}) {
  const { mediaId, enabled = true } = params;
  return useQuery({
    queryKey: anilistQueryKeys.entryState(mediaId ?? -1),
    queryFn: (): Promise<AniListEntryState> =>
      Effect.runPromise(getEntryState(anilistDeps(), { mediaId: mediaId ?? -1 })),
    enabled: enabled && mediaId != null,
  });
}

/**
 * Per-episode air dates and titles for an anime series. Public read, so it
 * works even when AniList is not connected; used both for the detail-screen
 * seasons UI and for gating "Log next episode" when the next episode hasn't
 * aired yet.
 */
export function useAniListEpisodesQuery(params: {
  mediaId: number | undefined;
  enabled?: boolean;
}) {
  const { mediaId, enabled = true } = params;
  return useQuery({
    queryKey: anilistQueryKeys.episodes(mediaId ?? -1),
    queryFn: (): Promise<NormalizedSeason> =>
      Effect.runPromise(getAnimeEpisodes(anilistDeps(), { mediaId: mediaId ?? -1 })),
    enabled: enabled && mediaId != null,
    staleTime: EPISODES_STALE_MS,
  });
}

/**
 * Suspense variant for mounting under `SuspenseSection` on the detail screen.
 */
export function useSuspenseAniListEpisodesQuery(params: { mediaId: number }) {
  const { mediaId } = params;
  return useSuspenseQuery({
    queryKey: anilistQueryKeys.episodes(mediaId),
    queryFn: (): Promise<NormalizedSeason> =>
      Effect.runPromise(getAnimeEpisodes(anilistDeps(), { mediaId })),
    staleTime: EPISODES_STALE_MS,
  });
}

