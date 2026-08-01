import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { exchangeSimklCode as exchangeSimklCodeForSession } from '@/lib/providers/simkl/auth';
import type { SimklDeps } from '@/lib/providers/simkl/deps';
import type {
  SimklLibrary,
  SimklLibraryBucket,
  SimklLibraryEntry,
  SimklTrendingKind,
  SimklWatchStatus,
} from '@/lib/providers/simkl/normalize';
import {
  getAllItems,
  getUserSettings,
  type SimklCalendarKind,
} from '@/lib/providers/simkl/reads';
import type { TokenStore } from '@/lib/providers/token-store';
import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderSession } from '@/types/session';
import {
  clearProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { useConnectedProviders } from '@/state/session';

// Module-level singleton for the same reason as trakt.ts/anilist.ts: effects
// compare the store by identity, and MMKV's change listener contract expects
// one writer path. No refresh machinery hangs off it — a Simkl 401 is a dead
// session (plan 0034 KTD-2), never a refresh trigger.
const tokenStore: TokenStore = {
  get: () => getProviderSession('simkl'),
  set: (session) => setProviderSession('simkl', session),
  clear: () => clearProviderSession('simkl'),
};

/**
 * Real dependency wiring for Simkl effects — the state → lib/providers
 * boundary, mirroring `traktDeps()`. No web branch: Simkl's API and CDN both
 * send `access-control-allow-origin: *` (plan 0034 KTD-9,
 * docs/solutions/web-cors-simkl.md territory), so the platform http client
 * works everywhere with no Worker proxy. Unlike TraktDeps there is no
 * `clientSecret` — Simkl is a public PKCE client (KTD-1).
 */
export function simklDeps(): SimklDeps {
  return {
    fetch: httpFetch,
    tokens: tokenStore,
    clientId: getClientIdForProvider('simkl'),
  };
}

/**
 * Authorization-code → session exchange, run at the Effect boundary so
 * components and session hooks never touch Effect directly (AGENTS.md
 * containment rule). `state` is validated against the persisted PKCE flow
 * inside the effect (`lib/providers/simkl/auth.ts`); success persists the
 * session, which flips `useConnectedProviders` for every subscriber.
 */
export function exchangeSimklCode(params: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<ProviderSession> {
  return Effect.runPromise(exchangeSimklCodeForSession(simklDeps(), params));
}

export const simklQueryKeys = {
  all: ['simkl'] as const,
  /**
   * One `/sync/all-items` snapshot per type/status filter. The unfiltered read
   * rides the `all/all` segments so "whole library" and "one bucket" can never
   * collide under one cache entry.
   */
  allItems: (type?: SimklLibraryBucket, status?: SimklWatchStatus) =>
    [...simklQueryKeys.allItemsRoot(), type ?? 'all', status ?? 'all'] as const,
  /**
   * Prefix over every `allItems` filter — the write-side invalidation target
   * (plan 0031 KTD-5 precedent, like `traktQueryKeys.watchlistRoot`): a write
   * can't know which type/status filters a surface has cached, so it names
   * the prefix instead of guessing arguments.
   */
  allItemsRoot: () => [...simklQueryKeys.all, 'all-items'] as const,
  /** `/sync/activities` — the cheap delta signal that gates `allItems`
   *  refetches (plan 0034 KTD-5). */
  activities: () => [...simklQueryKeys.all, 'activities'] as const,
  /**
   * The diary projection of the all-items snapshot (`getSimklDiary` — Simkl
   * has no history endpoint; watch instants live inside `/sync/all-items`).
   * Deliberately under the `allItemsRoot` prefix: every write-side
   * invalidation of the snapshot (log fan-out, watchlist mutations) is
   * exactly the signal on which the diary must refetch, so it rides the
   * existing `allItemsRoot()` invalidations for free. `'diary'` occupies the
   * type segment, which only ever holds `shows`/`movies`/`anime`/`all` — no
   * collision with any `allItems` filter key. Mirrored in
   * `diary-cache.ts`'s `DIARY_QUERY_ROOTS`.
   */
  diary: () => [...simklQueryKeys.allItemsRoot(), 'diary'] as const,
  /** One rolling CDN calendar file per kind (KTD-4). */
  calendar: (kind: SimklCalendarKind) =>
    [...simklQueryKeys.all, 'calendar', kind] as const,
  /** Public Most Watched CDN file — the trending rows' Trakt replacement (R11). */
  trending: (kind: SimklTrendingKind, interval?: 'today' | 'week' | 'month') =>
    [...simklQueryKeys.all, 'trending', kind, interval ?? 'week'] as const,
  /** The connected account itself — cached forever; disconnect purges the
   *  whole `['simkl']` root, so a reconnect as another user can't reuse it. */
  userSettings: () => [...simklQueryKeys.all, 'user-settings'] as const,
};

/**
 * How long the `watching` snapshot rides the cache — progress moves only when
 * the user logs, and a log already invalidates `simklQueryKeys.allItemsRoot()`
 * explicitly, so between logs it stays warm (the Trakt show-progress window).
 */
export const SIMKL_WATCHING_STALE_MS = 15 * 60_000;

/**
 * The `watching` snapshot's query options — one definition shared by Up
 * Next's Continue Watching gather (`up-next.ts`) and the details screen's
 * per-show entry hook below, so both ride a single cache entry: per-item
 * `status`, per-episode watched instants, and the server-computed
 * `next_to_watch` pointer with its air instant.
 */
export function simklWatchingLibraryQuery() {
  return {
    queryKey: simklQueryKeys.allItems(undefined, 'watching'),
    queryFn: (): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'watching' })),
    staleTime: SIMKL_WATCHING_STALE_MS,
  };
}

/**
 * Locate one item in a library snapshot. The buckets searched are chosen by
 * the item's own type rather than scanning all three: TMDB numbers movies and
 * TV in **separate id spaces**, so a movie and a show can legitimately share
 * an id, and a flat scan would cross-match them.
 */
export function findLibraryEntry(
  library: SimklLibrary,
  item: NormalizedMediaItem,
): SimklLibraryEntry | null {
  const filmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const simklId = item.externalIds.simkl;
  const tmdbId = item.externalIds.tmdb;
  // Anime is in both lists: Simkl files anime films under its anime catalog,
  // not `movies[]` (the same asymmetry `routing.ts` encodes for writes).
  const buckets = filmLike
    ? [...library.movies, ...library.anime]
    : [...library.shows, ...library.anime];
  for (const entry of buckets) {
    if (simklId != null && entry.item.externalIds.simkl === simklId) return entry;
    if (tmdbId != null && entry.item.externalIds.tmdb === tmdbId) return entry;
  }
  return null;
}

/**
 * The `plantowatch` snapshot's options — the **same cache entry** the watchlist
 * gather (`state/queries/watchlist.ts`) and Up Next's calendar intersection
 * already read, so consulting it costs nothing warm.
 */
export function simklPlanToWatchLibraryQuery() {
  return {
    queryKey: simklQueryKeys.allItems(undefined, 'plantowatch'),
    queryFn: (): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'plantowatch' })),
    staleTime: SIMKL_WATCHING_STALE_MS,
  };
}

/**
 * One show's Simkl library entry (watched keys, next-to-watch pointer) — the
 * Trakt-less source behind the TV details screen's checkmarks and one-tap log
 * button (plan 0034 R9's detail-screen counterpart).
 *
 * Reads the `watching` snapshot first and **falls back to `plantowatch`**
 * (plan 0036 follow-up, owner report 2026-08-01). Simkl holds one status per
 * item, so a show the user is part-way through but has parked back on the
 * watchlist lives only in the second snapshot — and reading just the first
 * left it with no checkmarks and no "Log S2E1" button on a screen that was
 * simultaneously displaying "10 / 20 episodes". Both snapshots are entries
 * other surfaces already cache (Continue Watching; the watchlist gather), so
 * the common case still costs no request, and the fallback query only runs
 * when the first answered "not here".
 *
 * `null` data means "answered, in neither snapshot" — a show parked in
 * `hold`/`dropped` still degrades to no checkmarks, exactly like a
 * disconnected Trakt.
 */
export function useSimklWatchingEntryQuery(params: {
  item: NormalizedMediaItem | null;
  enabled?: boolean;
}) {
  const { item, enabled = true } = params;
  const watching = useQuery({
    ...simklWatchingLibraryQuery(),
    enabled: enabled && item != null,
    select: (library: SimklLibrary) =>
      item == null ? null : findLibraryEntry(library, item),
  });
  // `data === null` is specifically "the snapshot loaded and this show is not
  // in it" — `undefined` is still loading, and must not trigger the fallback.
  const plannedEnabled = enabled && item != null && watching.data === null;
  const planned = useQuery({
    ...simklPlanToWatchLibraryQuery(),
    enabled: plannedEnabled,
    select: (library: SimklLibrary) =>
      item == null ? null : findLibraryEntry(library, item),
  });
  // Only the miss defers: an entry in `watching` is the fresher statement, and
  // is returned without the second query ever being enabled.
  return plannedEnabled ? planned : watching;
}

/**
 * The `completed` snapshot's options — where a **finished** item lives, which
 * for a movie is the only place it ever lives (Simkl holds one status per
 * item, and a watched movie is `completed`, never `watching`). Same 15-minute
 * window and same `allItemsRoot` invalidation prefix as its siblings, so a log
 * fan-out refreshes it without a poll.
 */
export function simklCompletedLibraryQuery() {
  return {
    queryKey: simklQueryKeys.allItems(undefined, 'completed'),
    queryFn: (): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'completed' })),
    staleTime: SIMKL_WATCHING_STALE_MS,
  };
}

/**
 * Whether Simkl already records this **film-like** item as watched — the Simkl
 * half of `useWatchedInfo` (`state/queries/watched-info.ts`).
 *
 * Films only, deliberately. Shinobu writes movie logs to Simkl but read them
 * back nowhere, so a movie logged to Simkl and not Trakt kept offering "Mark
 * as watched" forever (owner report 2026-08-01, Hokum). TV already has its own
 * Simkl leg in `useSimklWatchingEntryQuery`, whose progress line is richer
 * than the play count this returns; a *completed* show is still the documented
 * degrade in `docs/solutions/simkl-only-tv-details-trakt-gated.md`.
 *
 * `plays` is always ≥ 1: Simkl records only the latest play of a movie, with
 * no rewatch counter, so this proves "watched" without ever claiming a count
 * it doesn't have.
 */
export function useSimklWatchedInfo(
  item: NormalizedMediaItem,
): { plays: number; lastWatchedAt: string } | null {
  const filmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const completed = useQuery({
    ...simklCompletedLibraryQuery(),
    enabled: useConnectedProviders().includes('simkl') && filmLike,
    select: (library: SimklLibrary) => findLibraryEntry(library, item),
  });
  const entry = completed.data;
  // No instant means Simkl knows the film is finished but not when — it can
  // still say "watched", so the entry's own `lastUpdated` stands in rather
  // than dropping a true watch on the floor.
  if (entry == null || entry.status !== 'completed') return null;
  return {
    plays: Math.max(1, entry.item.currentProgress),
    lastWatchedAt: entry.lastWatchedAt ?? entry.item.lastUpdated,
  };
}

/**
 * The connected Simkl account's username, for "connected as who" on Manage
 * Trackers — the same contract as `useTraktViewerQuery`: cached forever (a
 * handle can't change under a live session, and a settings-screen nicety must
 * not cost a request per visit) and disabled until Simkl is connected.
 * `/users/settings` is POST-shaped despite being a read ("historical reasons",
 * api.simkl.org) — `getUserSettings` owns that; nothing here assumes GET.
 */
export function useSimklUsernameQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: simklQueryKeys.userSettings(),
    queryFn: () => Effect.runPromise(getUserSettings(simklDeps())),
    enabled: options.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    select: (settings) => settings.username ?? undefined,
  });
}
