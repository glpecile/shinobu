import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import { firstRow, indexLibrary, rowsWith, type LibraryIndex } from '@/lib/media-progress';
import { exchangeSimklCode as exchangeSimklCodeForSession } from '@/lib/providers/simkl/auth';
import type { SimklDeps } from '@/lib/providers/simkl/deps';
import { simklEpisodeState } from '@/lib/providers/simkl/episode-state';
import type {
  SimklLibrary,
  SimklLibraryBucket,
  SimklLibraryEntry,
  SimklTrendingKind,
  SimklWatchStatus,
} from '@/lib/providers/simkl/normalize';
import {
  getAllItems,
  getRatings,
  getUserSettings,
  ratingsLookup,
  type SimklCalendarKind,
  type SimklLookupParams,
} from '@/lib/providers/simkl/reads';
import type { TokenStore } from '@/lib/providers/token-store';
import { Provider } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderSession } from '@/types/session';
import {
  clearProviderSession,
  connectProviderSession,
  getProviderSession,
  setProviderSession,
} from '@/state/session/tokens';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { useConnectedProviders } from '@/state/session';

// Keep the token-store identity stable for auth and MMKV subscriptions.
const tokenStore: TokenStore = {
  get: () => getProviderSession(Provider.Simkl),
  set: (session) => setProviderSession(Provider.Simkl, session),
  clear: () => clearProviderSession(Provider.Simkl),
};

/** Simkl API and CDN reads use the same transport on native and web. */
export function simklDeps(): SimklDeps {
  return {
    fetch: httpFetch,
    tokens: tokenStore,
    clientId: getClientIdForProvider(Provider.Simkl),
  };
}

export function exchangeSimklCode(params: {
  code: string;
  state: string;
  redirectUri: string;
}): Promise<ProviderSession> {
  const tokens = {
    ...tokenStore,
    set: (session: ProviderSession) => connectProviderSession(Provider.Simkl, session),
  };
  return Effect.runPromise(exchangeSimklCodeForSession({ ...simklDeps(), tokens }, params));
}

export const simklQueryKeys = {
  all: [Provider.Simkl] as const,
  /** The all/all key distinguishes a whole-library snapshot from a single bucket. */
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
  calendar: (kind: SimklCalendarKind) =>
    [...simklQueryKeys.all, 'calendar', kind] as const,
  trending: (kind: SimklTrendingKind, interval?: 'today' | 'week' | 'month') =>
    [...simklQueryKeys.all, 'trending', kind, interval ?? 'week'] as const,
  /** The connected account itself — cached forever; disconnect purges the
   *  whole `['simkl']` root, so a reconnect as another user can't reuse it. */
  userSettings: () => [...simklQueryKeys.all, 'user-settings'] as const,
  ratings: (lookup: SimklLookupParams | null) => [...simklQueryKeys.all, 'ratings', lookup] as const,
};

/** Writes invalidate the snapshot. Staleness covers edits made elsewhere. */
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
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), { status: 'watching' }), { signal }),
    staleTime: SIMKL_WATCHING_STALE_MS,
  };
}

/**
 * The snapshot split into the buckets `findLibraryEntry` searches, each indexed
 * once. TMDB numbers movies and TV in **separate id spaces**, so a movie and a
 * show can legitimately share an id; the buckets keep them apart.
 */
interface SimklLibraryIndex {
  films: LibraryIndex<SimklLibraryEntry>;
  shows: LibraryIndex<SimklLibraryEntry>;
  animeShows: LibraryIndex<SimklLibraryEntry>;
}

const entryItem = (entry: SimklLibraryEntry) => entry.item;

// One index per snapshot: every single-item `select` on a details screen reads the same one.
// Never mutate a cached snapshot in place: the index would go stale. A refetch or
// `setQueryData` must give a new object.
const indexes = new WeakMap<SimklLibrary, SimklLibraryIndex>();

function indexSimklLibrary(library: SimklLibrary): SimklLibraryIndex {
  const known = indexes.get(library);
  if (known != null) return known;
  // Anime is in both lists: Simkl files anime films under its anime catalog,
  // not `movies[]` (the same asymmetry `routing.ts` encodes for writes).
  const animeShows = library.anime.filter((entry) => entry.item.isFilm !== true);
  const index = {
    films: indexLibrary([...library.movies, ...library.anime.filter((entry) => entry.item.isFilm === true)], entryItem),
    shows: indexLibrary([...library.shows, ...animeShows], entryItem),
    animeShows: indexLibrary(animeShows, entryItem),
  };
  indexes.set(library, index);
  return index;
}

export function findLibraryEntry(library: SimklLibrary, item: NormalizedMediaItem): SimklLibraryEntry | null {
  return findIndexedEntry(indexSimklLibrary(library), item);
}

function findIndexedEntry(index: SimklLibraryIndex, item: NormalizedMediaItem): SimklLibraryEntry | null {
  const filmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const bucket = filmLike ? index.films : index.shows;
  // Every season of an anime shares the show's TMDB id. Only a Simkl id
  // identifies the same cour; otherwise a sibling's progress leaks through.
  const byTmdb = !(item.type === 'ANIME' && !filmLike);
  // oxlint-disable-next-line shinobu/no-provider-literals -- externalIds keys, not provider ids.
  return firstRow(bucket, item, ['simkl'])
    // oxlint-disable-next-line shinobu/no-provider-literals -- externalIds keys, not provider ids.
    ?? (item.type === 'ANIME' ? firstRow(bucket, item, ['anilist', 'mal']) : undefined)
    ?? (byTmdb ? firstRow(bucket, item, ['tmdb']) : undefined)
    ?? null;
}

/** TV layouts span cours; ANIME items still resolve only their exact entry. */
function libraryEpisodeEntries(library: SimklLibrary, item: NormalizedMediaItem) {
  const index = indexSimklLibrary(library);
  const exact = findIndexedEntry(index, item);
  const tmdbId = item.externalIds.tmdb;
  const anime = item.type === 'TV' && tmdbId != null
    ? [...rowsWith(index.animeShows, 'tmdb', tmdbId)].map((row) => index.animeShows.rows[row])
    : [];
  return [...(exact == null || anime.includes(exact) ? [] : [exact]), ...anime];
}

export function findLibraryEpisodeState(library: SimklLibrary, item: NormalizedMediaItem) {
  const entries = libraryEpisodeEntries(library, item);
  return entries.length === 0 ? null : simklEpisodeState(entries);
}

/** Count both cours on a TV page, without counting a parallel TV entry twice. */
export function findLibraryProgress(library: SimklLibrary, item: NormalizedMediaItem): number | null {
  const entries = libraryEpisodeEntries(library, item);
  if (entries.length === 0) return null;
  const animeProgress = entries
    .filter((entry) => entry.item.type === 'ANIME')
    .reduce((count, entry) => count + entry.item.currentProgress, 0);
  const tvProgress = entries
    .filter((entry) => entry.item.type !== 'ANIME')
    .reduce((count, entry) => Math.max(count, entry.item.currentProgress), 0);
  return Math.max(animeProgress, tvProgress);
}

export function useSimklEpisodeStateQuery(params: {
  item: NormalizedMediaItem;
  enabled?: boolean;
}) {
  return useQuery({
    ...simklLibraryQuery(),
    enabled: params.enabled,
    select: (library: SimklLibrary) => findLibraryEpisodeState(library, params.item),
  });
}

/** All item-level Simkl details share the unfiltered library snapshot. */
export function simklLibraryQuery() {
  return {
    queryKey: simklQueryKeys.allItems(),
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<SimklLibrary> =>
      Effect.runPromise(getAllItems(simklDeps(), {}), { signal }),
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

/** Shares the library cache with the episode marks and per-cour entry reads. */
export function useSimklProgressQuery(params: {
  item: NormalizedMediaItem | null;
  enabled?: boolean;
}) {
  const { item, enabled = true } = params;
  return useQuery({
    ...simklLibraryQuery(),
    enabled: enabled && item != null,
    select: (library: SimklLibrary) =>
      item == null ? null : findLibraryProgress(library, item),
  });
}

/**
 * Whether Simkl already records this item as watched — the Simkl half of
 * `useWatchedInfo` (`state/queries/watched-info.ts`).
 *
 * Films count once `completed` (owner report 2026-08-01, Hokum: a movie
 * logged to Simkl and not Trakt kept offering "Mark as watched" forever);
 * `plays` is always ≥ 1 because Simkl records only the latest play, with no
 * rewatch counter. A series counts once any episode is logged, whatever its
 * status — the same contract as Trakt's TV leg, so a studio or person page
 * marks a Simkl-only user's shows the way it marks a Trakt user's. The details
 * screen still reads the richer status verb off `useSimklLibraryEntryQuery`.
 */
export function useSimklWatchedInfo(
  item: NormalizedMediaItem,
): { plays: number; lastWatchedAt: string } | null {
  const filmLike =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  const entry = useSimklLibraryEntryQuery({
    item,
    enabled: useConnectedProviders().includes(Provider.Simkl) && (filmLike || item.type === 'TV'),
  }).data;
  const progress = useSimklProgressQuery({
    item,
    enabled: useConnectedProviders().includes(Provider.Simkl) && (filmLike || item.type === 'TV'),
  }).data;
  // `enabled: false` stops the *fetch*, not the read: the snapshot is one
  // shared cache entry, so a screen another hook populated it for still
  // selects a real entry here. Gate the answer, not just the request.
  if (entry == null || !(filmLike || item.type === 'TV')) return null;
  if (filmLike && entry.status !== 'completed') return null;
  if (!filmLike && (progress ?? 0) <= 0) return null;
  // No instant means Simkl knows it's watched but not when — the entry's own
  // `lastUpdated` stands in rather than dropping a true watch on the floor.
  return {
    plays: Math.max(1, progress ?? entry.item.currentProgress),
    lastWatchedAt: entry.lastWatchedAt ?? entry.item.lastUpdated,
  };
}

/**
 * The connected Simkl account's username and avatar, for "connected as who" on Manage
 * Trackers — the same contract as `useTraktViewerQuery`: cached forever (a
 * handle can't change under a live session, and a settings-screen nicety must
 * not cost a request per visit) and disabled until Simkl is connected.
 * `/users/settings` is POST-shaped despite being a read ("historical reasons",
 * api.simkl.org) — `getUserSettings` owns that; nothing here assumes GET.
 */
export function useSimklUserSettingsQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: simklQueryKeys.userSettings(),
    queryFn: ({ signal }) => Effect.runPromise(getUserSettings(simklDeps()), { signal }),
    enabled: options.enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

const RATINGS_STALE_MS = 24 * 60 * 60_000;

/**
 * Simkl's score and the IMDb or MAL one beside it, for the details Ratings
 * section. Scores move slowly and Simkl caches `/ratings` for two days, so a
 * day here costs nothing in freshness.
 */
export function useSuspenseSimklRatingsQuery(item: NormalizedMediaItem) {
  const lookup = ratingsLookup(item);
  return useSuspenseQuery({
    queryKey: simklQueryKeys.ratings(lookup),
    queryFn: ({ signal }) =>
      lookup == null ? [] : Effect.runPromise(getRatings(simklDeps(), lookup), { signal }),
    staleTime: RATINGS_STALE_MS,
    gcTime: RATINGS_STALE_MS,
  });
}
