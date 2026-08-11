import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { DIARY_QUERY_ROOTS } from '@/state/queries/diary-cache';
import { SEARCH_QUERY_ROOTS } from '@/state/queries/search-cache';
import { sessionFromImplicitRedirect } from '@/lib/providers/anilist/auth';
import type { AniListDeps } from '@/lib/providers/anilist/deps';
import { getAnimeEpisodes } from '@/lib/providers/anilist/episodes';
import {
  getCurrentAnime,
  getEntryState,
  getSeasonalAnime,
  getViewer,
  searchAniListStaff,
  searchAniListStudio,
  searchMedia,
  type AniListEntryState,
} from '@/lib/providers/anilist/reads';
import { namesMatch, pickPersonMatch } from '@/lib/providers/tmdb/normalize';
import type { AniListCurrentEntry } from '@/lib/providers/anilist/normalize';
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
  /**
   * The PLANNING slice of the same cached entries read — the AniList leg of the
   * cross-provider watchlist (plan 0031 U12). A *third derived key*, not a
   * third request: `currentAnimeEntries` already carries PLANNING (plan 0030
   * R12), which is precisely why the watchlist read costs 0 extra calls against
   * the 30 req/min budget (docs/solutions/anilist-rate-limit-retry-storm.md).
   *
   * Derived, so it inherits `currentAnime`'s invalidation trap: anything that
   * invalidates this key must invalidate `currentAnimeEntries()` too, or the
   * refetch runs straight off the stale entries cache.
   */
  plannedAnime: () => [...anilistQueryKeys.all, 'planned-anime'] as const,
  /**
   * The same list read, cached with its airing info and list status intact
   * (plan 0019 U2). `currentAnime` is derived from *this* entry, so the feed
   * row keeps its plain `NormalizedMediaItem[]` contract while Up Next reads
   * the richer shape — one network request feeds both, now including the
   * PLANNING entries only Up Next's Calendar half wants (plan 0030 R12).
   */
  currentAnimeEntries: () =>
    [...anilistQueryKeys.all, 'current-anime-entries'] as const,
  /** Popular anime of one cour — keyed by season so a boundary crossing refetches. */
  seasonalAnime: (window: AnimeSeasonWindow) =>
    [...anilistQueryKeys.all, 'seasonal-anime', window.season, window.year] as const,
  /** The viewer's recorded state for one media — reconcile reads this (plan 0011). */
  entryState: (mediaId: number) =>
    [...anilistQueryKeys.all, 'entry-state', mediaId] as const,
  /** Per-episode air dates + titles for one anime series (detail screen). */
  episodes: (mediaId: number) =>
    [...anilistQueryKeys.all, 'episodes', mediaId] as const,
  /** Prefix over every search entry — details/[id] scans this for cache hits
   *  (the only route a manga result can resolve through). Shared root so the
   *  scan in `search-cache.ts` can't drift from the key built here. */
  searchRoot: () => [...SEARCH_QUERY_ROOTS.anilist],
  /** Public anime + manga text search (search screen's AniList section). */
  search: (query: string, limit: number) =>
    [...anilistQueryKeys.searchRoot(), query, limit] as const,
  /** The viewer's media-list activity — the AniList diary source (plan 0016).
   *  Derived from the shared root so the diary cache scan stays in sync. */
  listActivity: () => [...DIARY_QUERY_ROOTS.anilist],
  /** A person's AniList staff id, resolved by name (plan 0035 R12). */
  staffId: (name: string) => [...anilistQueryKeys.all, 'staff-id', name] as const,
  /** A studio's AniList id, resolved by name — the studio sheet's link. */
  studioId: (name: string) =>
    [...anilistQueryKeys.all, 'studio-id', name] as const,
};

/**
 * A name→id mapping does not change: AniList staff and studio ids are stable
 * for the life of the entry. Same tier as `tmdbQueryKeys.person`, and it is what
 * keeps a sheet that is opened, closed and re-opened off the 30 req/min budget
 * (docs/solutions/anilist-rate-limit-retry-storm.md).
 */
const NAME_RESOLUTION_STALE_MS = 24 * 60 * 60_000;

/**
 * Two consumers want the currently-watching list at different fidelities (the
 * feed row wants items, Up Next wants airing info), and the 30 req/min budget
 * says they share one request. So the *entries* key owns the network read and
 * the items key derives from it; this window keeps the second reader off the
 * wire without letting either go visibly stale (a log invalidates both).
 */
const CURRENT_ANIME_STALE_MS = 60_000;

/**
 * The viewer's currently-watching list with airing info (plan 0019 U2). The
 * viewer-id prefix request is cached forever under its own key (it never
 * changes for a session; the disconnect flow purges it), so steady-state
 * refreshes spend 1 request of the 30/min budget instead of 2.
 */
export function fetchCurrentAnimeEntries(
  queryClient: QueryClient,
): Promise<AniListCurrentEntry[]> {
  return queryClient.fetchQuery({
    queryKey: anilistQueryKeys.currentAnimeEntries(),
    queryFn: async () => {
      const deps = anilistDeps();
      const viewer = await queryClient.fetchQuery({
        queryKey: anilistQueryKeys.viewer(),
        queryFn: () => Effect.runPromise(getViewer(deps)),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
      });
      return Effect.runPromise(getCurrentAnime(deps, { viewerId: viewer.id }));
    },
    staleTime: CURRENT_ANIME_STALE_MS,
  });
}

/**
 * The plan-to-watch slice of the same cached list — the AniList leg of the
 * cross-provider watchlist (plan 0031 U12/R26). A **selector, not a query**:
 * plan 0030 R12 already widened the one list read to
 * `status_in: [CURRENT, PLANNING]`, so those entries are sitting in the
 * `currentAnimeEntries()` cache already and this costs **0 extra requests**.
 * That is the whole reason 0030 chose `status_in` over a second read, and the
 * 30 req/min budget is why it must stay that way
 * (docs/solutions/anilist-rate-limit-retry-storm.md) — never "fix" this by
 * adding a PLANNING query.
 *
 * The sibling slices are deliberately disjoint and stay that way: this one is
 * PLANNING only, and Up Next's gate (`features/up-next/compute.ts`) still lets
 * a PLANNING entry reach Calendar alone. Widening any of them re-opens the
 * regression in `docs/solutions/anilist-shared-list-query-status-gate.md`.
 *
 * Returns the rich entries rather than plain items: the watchlist surface
 * needs `entryId` for the removal path, and callers that only want cards take
 * `.item`.
 */
export async function fetchPlannedAnime(
  queryClient: QueryClient,
): Promise<AniListCurrentEntry[]> {
  const entries = await fetchCurrentAnimeEntries(queryClient);
  return entries.filter((entry) => entry.status === 'PLANNING');
}

/**
 * The **watchlist** slice: CURRENT ∪ PLANNING off the same cached read (plan
 * 0035 R1/KTD1). An anime you are actively watching is on your watchlist —
 * that is what the owner means by watchlisted — so the surface reads both
 * statuses while every other consumer keeps its own narrower slice.
 *
 * A **separate selector, never a widened `fetchPlannedAnime`** — that one stays
 * PLANNING-only, and Up Next's gate
 * (`features/up-next/compute.ts`) still confines PLANNING to Calendar. That
 * separation is the whole point of
 * `docs/solutions/anilist-shared-list-query-status-gate.md`: the gate restricts
 * what PLANNING may reach, so letting CURRENT reach one more read-only surface
 * does not touch it. Editing any existing selector instead of adding this one
 * is what re-opens the regression.
 *
 * Still 0 extra requests — same cached `currentAnimeEntries()` payload.
 */
export async function fetchWatchlistAnime(
  queryClient: QueryClient,
): Promise<AniListCurrentEntry[]> {
  const entries = await fetchCurrentAnimeEntries(queryClient);
  return entries.filter(
    (entry) => entry.status === 'PLANNING' || entry.status === 'CURRENT',
  );
}

/** Popular anime of the given cour ("Summer 2026") — the feed's anime row. */
export function fetchSeasonalAnime(window: AnimeSeasonWindow): Promise<NormalizedMediaItem[]> {
  return Effect.runPromise(
    getSeasonalAnime(anilistDeps(), { season: window.season, year: window.year }),
  );
}

/**
 * The connected AniList account (id + handle), on the same forever-cached key
 * the list reads already prime — so the Manage Trackers card showing "who am I
 * connected as" costs no extra request once anything else has run, and at most
 * one on a cold settings visit (the 30 req/min budget is the constraint here,
 * `docs/solutions/anilist-rate-limit-retry-storm.md`).
 */
export function useAniListViewerQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: anilistQueryKeys.viewer(),
    queryFn: () => Effect.runPromise(getViewer(anilistDeps())),
    enabled: options.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
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
 * The AniList staff id for a person's name, or `null` when nothing matches
 * confidently (plan 0035 R12/R13) — what turns "Open in AniList" from a link
 * into no link at all.
 *
 * Three properties are load-bearing:
 *
 * - **Lazy.** `enabled` is the sheet's own open flag, so a Cast rail of 20 cards
 *   costs 0 requests; only the one a user long-pressed resolves. Firing per-pill
 *   on render is what the 30 req/min budget forbids.
 * - **Public.** No token, so this works before AniList is connected — though the
 *   pill itself only renders while it is.
 * - **Validated.** `pickPersonMatch` is the house matcher (exact folded name,
 *   then a word-order swap for family-name-first romanizations), and its fuzzy
 *   top-hit fallback is deliberately **discarded** here: an actor AniList has
 *   never heard of would otherwise deep-link to whoever came back first. A
 *   near-name is a wrong page, and R13 says hide instead.
 */
export function useAniListStaffIdQuery(params: {
  name: string;
  enabled?: boolean;
}) {
  const name = params.name.trim();
  return useQuery({
    queryKey: anilistQueryKeys.staffId(name),
    queryFn: async (): Promise<number | null> => {
      const hits = await Effect.runPromise(
        searchAniListStaff(anilistDeps(), { name }),
      );
      return exactNameMatchId(hits, name);
    },
    enabled: (params.enabled ?? true) && name !== '',
    staleTime: NAME_RESOLUTION_STALE_MS,
  });
}

/** The studio half of `useAniListStaffIdQuery`, rule for rule. */
export function useAniListStudioIdQuery(params: {
  name: string;
  enabled?: boolean;
}) {
  const name = params.name.trim();
  return useQuery({
    queryKey: anilistQueryKeys.studioId(name),
    queryFn: async (): Promise<number | null> => {
      const hits = await Effect.runPromise(
        searchAniListStudio(anilistDeps(), { name }),
      );
      return exactNameMatchId(hits, name);
    },
    enabled: (params.enabled ?? true) && name !== '',
    staleTime: NAME_RESOLUTION_STALE_MS,
  });
}

/**
 * `pickPersonMatch` with its top-hit fallback stripped (R13). The matcher's
 * last resort — "the caller opted into name search knowing it's fuzzy" — is
 * right for a lookup route that shows the user what it found and wrong for a
 * link that silently opens a page: most TMDB people simply are not on AniList,
 * so the fallback would deep-link an unrelated staff member far more often than
 * it would be right. Confident match or nothing.
 */
function exactNameMatchId(
  hits: readonly { id: number; name: string }[],
  name: string,
): number | null {
  const match = pickPersonMatch([...hits], name);
  if (match == null || !namesMatch(match.name, name)) return null;
  return match.id;
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

