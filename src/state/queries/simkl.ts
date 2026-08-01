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
 * The **whole** library snapshot — every status in one request. The single
 * source behind every per-item Simkl read on a details screen: the season
 * accordion's checkmarks, the watched line, the one-tap log button, and
 * `useSimklWatchedInfo` below.
 *
 * This replaces a status-filtered chain (`watching`, then `plantowatch` on a
 * miss, plus a `completed` read for films) whose real flaw was that a
 * **finished** show was in none of them. Doctor Who — 153/153 watched —
 * rendered every episode with an unticked "Mark as watched", and opened fresh
 * showed `0 / 153` and "Log S1E1" (owner report 2026-08-01). Simkl holds
 * exactly one status per item, so any filtered read is a guess about which
 * bucket the user parked a show in; `hold` and `dropped` were invisible for
 * the same reason, and `completed` shows were the documented degrade in
 * docs/solutions/simkl-only-tv-details-trakt-gated.md.
 *
 * One unfiltered read is also **fewer requests** than the chain it replaces —
 * one, not up to three sequential round trips, each waiting on the previous
 * one's miss — and one cache entry for every details surface. It rides the
 * same `allItemsRoot` invalidation prefix, so a log fan-out refreshes it and
 * nothing polls it (docs/solutions/simkl-rate-limits-and-write-lock.md).
 *
 * Up Next deliberately keeps the narrow `watching` snapshot above: Continue
 * Watching treats every entry it reads as a candidate, so widening *that* read
 * would put finished and dropped shows on the home feed. Two entries, each
 * shaped for its surface.
 */
export function simklLibraryQuery() {
  return {
    queryKey: simklQueryKeys.allItems(),
    queryFn: (): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), {})),
    staleTime: SIMKL_WATCHING_STALE_MS,
  };
}

/**
 * One item's Simkl library entry — watched keys, status, next-to-watch
 * pointer. `null` data means "the snapshot loaded and this item is not in the
 * user's library at all", which is now the only reason to degrade: every
 * status resolves.
 */
export function useSimklLibraryEntryQuery(params: {
  item: NormalizedMediaItem | null;
  enabled?: boolean;
}) {
  const { item, enabled = true } = params;
  return useQuery({
    ...simklLibraryQuery(),
    enabled: enabled && item != null,
    select: (library: SimklLibrary) =>
      item == null ? null : findLibraryEntry(library, item),
  });
}

/**
 * Whether Simkl already records this **film-like** item as watched — the Simkl
 * half of `useWatchedInfo` (`state/queries/watched-info.ts`).
 *
 * Films only, deliberately. Shinobu writes movie logs to Simkl but read them
 * back nowhere, so a movie logged to Simkl and not Trakt kept offering "Mark
 * as watched" forever (owner report 2026-08-01, Hokum). TV goes through
 * `useSimklLibraryEntryQuery` directly, whose per-episode progress line is
 * richer than the play count this returns.
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
  const entry = useSimklLibraryEntryQuery({
    item,
    enabled: useConnectedProviders().includes('simkl') && filmLike,
  }).data;
  // `enabled: false` stops the *fetch*, not the read: the snapshot is one
  // shared cache entry, so a TV screen — where another hook already populated
  // it — still selects a real entry here. Gate the answer, not just the
  // request, or a fully-watched series reports as a watched *film* and the
  // details line reads "Watching · 153 episodes logged" from the movie path.
  if (!filmLike) return null;
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
