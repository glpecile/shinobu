import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { sessionFromImplicitRedirect } from '@/lib/providers/anilist/auth';
import { getAnimeCredits, type AnimeCredits } from '@/lib/providers/anilist/credits';
import type { AniListDeps } from '@/lib/providers/anilist/deps';
import { getAnimeEpisodes } from '@/lib/providers/anilist/episodes';
import {
  getCurrentAnime,
  getEntryState,
  getTrendingAnime,
  getViewerId,
  type AniListEntryState,
} from '@/lib/providers/anilist/reads';
import type { NormalizedSeason } from '@/types/media';
import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';

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

export const anilistQueryKeys = {
  all: ['anilist'] as const,
  viewer: () => [...anilistQueryKeys.all, 'viewer'] as const,
  currentAnime: () => [...anilistQueryKeys.all, 'current-anime'] as const,
  trendingAnime: (limit?: number) =>
    [...anilistQueryKeys.all, 'trending-anime', limit ?? 'default'] as const,
  /** The viewer's recorded state for one media — reconcile reads this (plan 0011). */
  entryState: (mediaId: number) =>
    [...anilistQueryKeys.all, 'entry-state', mediaId] as const,
  /** Per-episode air dates + titles for one anime series (detail screen). */
  episodes: (mediaId: number) =>
    [...anilistQueryKeys.all, 'episodes', mediaId] as const,
  /** Cast, staff, and studios for one anime detail screen. */
  credits: (mediaId: number) =>
    [...anilistQueryKeys.all, 'credits', mediaId] as const,
};

/**
 * The viewer's currently-watching list, chained behind the viewer-id lookup
 * in one effect (2 requests against the 30/min budget). Exposed as a plain
 * promise so `useUnifiedFeed` can consume it as a queryFn.
 */
export function fetchCurrentAnime(): Promise<NormalizedMediaItem[]> {
  const deps = anilistDeps();
  return Effect.runPromise(
    getViewerId(deps).pipe(
      Effect.flatMap((viewerId) => getCurrentAnime(deps, { viewerId })),
    ),
  );
}

export function fetchTrendingAnime(options: { limit?: number } = {}): Promise<NormalizedMediaItem[]> {
  return Effect.runPromise(getTrendingAnime(anilistDeps(), options));
}

/**
 * Authenticated read of the viewer's watching list — enable-on-connect
 * contract matches `useWatchedShowsQuery`.
 */
export function useCurrentAnimeQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: anilistQueryKeys.currentAnime(),
    queryFn: fetchCurrentAnime,
    enabled: options.enabled,
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
    staleTime: 60_000,
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
  });
}

/**
 * Public detail credits. This one query covers cast (Japanese voice actors),
 * staff, and studios, so the three UI sections suspend together.
 */
export function useSuspenseAniListCreditsQuery(params: { mediaId: number }) {
  const { mediaId } = params;
  return useSuspenseQuery({
    queryKey: anilistQueryKeys.credits(mediaId),
    queryFn: (): Promise<AnimeCredits> =>
      Effect.runPromise(getAnimeCredits(anilistDeps(), { mediaId })),
  });
}
