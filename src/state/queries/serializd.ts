import { queryOptions, useQuery, useSuspenseInfiniteQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { getSerializdList, getSerializdListsPage, type SerializdListEntry, type SerializdListKind } from '@/lib/providers/serializd/lists';
import { serializdBaseUrl, serializdFetch } from '@/lib/providers/serializd/transport';
import { loginToSerializd, validateAuthToken } from '@/lib/providers/serializd/auth';
import type { SerializdDeps, SerializdSession } from '@/lib/providers/serializd/deps';
import { Provider } from '@/lib/providers/types';
import { getSerializdSession, getSerializdUsername } from '@/state/session/serializd';
import { getWatchedEpisodeKeys } from '@/lib/providers/serializd/progress';
import { getSerializdTrackingLists, serializdTrackingState } from '@/lib/providers/serializd/tracking';
import { getSerializdWatchedShows, type SerializdWatchedShow } from '@/lib/providers/serializd/watched';
import { getSerializdUpcoming, type SerializdUpcomingEpisode } from '@/lib/providers/serializd/upcoming';

/**
 * Real dependency wiring for Serializd effects — same state → lib/providers
 * arrow as `traktDeps()`/`letterboxdDeps()`. The transport (`fetch` + `baseUrl`)
 * is the platform seam (KTD4): native reaches the upstream host with app
 * headers, web the same-origin proxy. Works on every platform (R13) — no
 * `EXPO_OS` gate. List reads pass their cache-key username so anonymous or
 * stale-account queries never authenticate as a different stored account.
 */
export function serializdDeps(username?: string | null): SerializdDeps {
  const session = getSerializdSession();
  return {
    fetch: serializdFetch,
    baseUrl: serializdBaseUrl,
    session: username === undefined || session?.username === username ? session : null,
  };
}

/**
 * Web connect: exchanges email and password for a session. Rejects with the
 * provider error, whose message is the API's own (wrong password, etc.).
 */
export async function loginSerializd(credentials: {
  email: string;
  password: string;
}): Promise<SerializdSession> {
  const deps = serializdDeps();
  const login = await Effect.runPromise(loginToSerializd(deps, credentials));
  let username = login.username;
  if (username === '') {
    // Some login responses omit the username; validating the token returns it.
    username = await Effect.runPromise(validateAuthToken(deps, login.token)).then(
      (validated) => validated.username,
      () => '',
    );
  }
  return { accessToken: login.token, username };
}

/** Native connect: validates a token captured from the sign-in WebView. */
export function validateSerializdToken(token: string): Promise<SerializdSession> {
  return Effect.runPromise(validateAuthToken(serializdDeps(), token)).then((result) => ({
    accessToken: result.token,
    username: result.username,
  }));
}

/**
 * Query keys rooted at `['serializd', …]` (matches disconnect's
 * `removeQueries({ queryKey: ['serializd'] })`, R6). The progress keys
 * include the username so reconnecting as a different account never serves the
 * prior account's entries (Letterboxd's pattern).
 *
 * There is deliberately no cached season-id query: writes resolve the seasonId
 * inline on every log (`resolveSeasonId`), which *self-heals* a
 * currently-airing season Serializd hasn't ingested yet — a forever-cache would
 * be the very thing that permanently skips later episodes (KTD6). The one extra
 * GET per log is within the politeness budget (KTD7).
 */
export const serializdQueryKeys = {
  all: [Provider.Serializd] as const,
  watchedShows: (username: string) => [...serializdQueryKeys.all, 'watched-shows', username] as const,
  trackingLists: (username: string) => [...serializdQueryKeys.all, 'tracking-lists', username] as const,
  listsRoot: () => [...serializdQueryKeys.all, 'lists'] as const,
  lists: (username: string, kind: SerializdListKind) => [...serializdQueryKeys.listsRoot(), username, kind] as const,
  listRoot: () => [...serializdQueryKeys.all, 'list'] as const,
  list: (username: string | null, id: string) => [...serializdQueryKeys.listRoot(), username, id] as const,
  upcoming: (username: string) => [...serializdQueryKeys.all, 'upcoming', username] as const,
  progress: (username: string, tmdbId: number) =>
    [...serializdQueryKeys.all, 'progress', username, tmdbId] as const,
};

function watchedShowsQuery(username: string | null) {
  return queryOptions({
    queryKey: serializdQueryKeys.watchedShows(username ?? ''),
    queryFn: ({ signal }) => Effect.runPromise(getSerializdWatchedShows(serializdDeps(username)), { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Mounted TV marks share one account-wide read, not a request chain per poster. */
export function useSerializdWatchedShowsQuery(username: string | null) {
  return useQuery({ ...watchedShowsQuery(username), enabled: username != null, throwOnError: false });
}

function findWatchedShow(shows: readonly SerializdWatchedShow[], tmdbId: number) {
  return shows.find((show) => show.item.externalIds.tmdb === tmdbId);
}

function trackingListsQuery(username: string | null) {
  return queryOptions({
    queryKey: serializdQueryKeys.trackingLists(username ?? ''),
    queryFn: ({ signal }) => Effect.runPromise(getSerializdTrackingLists(serializdDeps(username)), { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * The show's status for a pause or drop: the three status lists read fresh
 * into their query, and the watched snapshot from cache only when no list
 * holds the show.
 */
export async function fetchSerializdTrackingState(queryClient: QueryClient, tmdbId: number) {
  const username = getSerializdUsername();
  const lists = await queryClient.fetchQuery({ ...trackingListsQuery(username), staleTime: 0 });
  const listed = serializdTrackingState(lists, tmdbId, undefined);
  if (listed != null) return listed;
  const watched = await queryClient.fetchQuery(watchedShowsQuery(username));
  return serializdTrackingState(lists, tmdbId, findWatchedShow(watched, tmdbId));
}

/** The show's Serializd status, null when untracked and undefined until both reads land. */
export function useSerializdTrackingStateQuery({ tmdbId, enabled }: { tmdbId: number | undefined; enabled: boolean }) {
  const username = getSerializdUsername();
  const on = enabled && username != null && tmdbId != null;
  const lists = useQuery({ ...trackingListsQuery(username), enabled: on });
  const watched = useSerializdWatchedShowsQuery(on ? username : null);
  if (!on || lists.data == null || watched.data == null) return undefined;
  return serializdTrackingState(lists.data, tmdbId, findWatchedShow(watched.data, tmdbId));
}

/** Shares the episode-granular progress cache used by log reconciliation. */
export function useSerializdProgressQuery(tmdbId: number | undefined, username: string | null) {
  return useQuery({
    queryKey: serializdQueryKeys.progress(username ?? '', tmdbId ?? -1),
    queryFn: ({ signal }) => Effect.runPromise(getWatchedEpisodeKeys(serializdDeps(username), { tmdbId: tmdbId! }), { signal }),
    enabled: username != null && tmdbId != null,
    staleTime: 5 * 60_000,
  });
}

/** Serializd's "Coming soon" for the signed-in account. */
export function useSuspenseSerializdUpcomingQuery(username: string) {
  return useSuspenseQuery({
    queryKey: serializdQueryKeys.upcoming(username),
    queryFn: ({ signal }) => Effect.runPromise(getSerializdUpcoming(serializdDeps(username)), { signal }),
    staleTime: 60 * 60_000,
  });
}

const LISTS_STALE_MS = 15 * 60_000;

/** Home and View all share pages; only View all fetches successors. */
export function useSuspenseSerializdListsQuery(username: string, kind: SerializdListKind) {
  return useSuspenseInfiniteQuery({
    queryKey: serializdQueryKeys.lists(username, kind),
    queryFn: ({ pageParam, signal }) => Effect.runPromise(getSerializdListsPage(serializdDeps(username), { username, kind, page: pageParam }), { signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, page) => lastPage.hasNextPage && page < 9999 ? page + 1 : undefined,
    staleTime: LISTS_STALE_MS,
  });
}

export function useSuspenseSerializdListQuery(username: string | null, id: string) {
  return useSuspenseQuery({
    queryKey: serializdQueryKeys.list(username, id),
    queryFn: ({ signal }) => Effect.runPromise(getSerializdList(serializdDeps(username), id), { signal }),
    staleTime: LISTS_STALE_MS,
    gcTime: LISTS_STALE_MS,
  });
}

/** Cache-only resolution keeps list entries usable even without a TMDB token. */
export function findInSerializdListsCache(queryClient: QueryClient, id: string) {
  if (typeof window === 'undefined') return undefined;
  // Same username source as the detail query's key (`getSerializdUsername()`),
  // so a connected-but-invalid session never hides a cached hit.
  return queryClient.getQueriesData<{ entries: SerializdListEntry[] }>({ queryKey: [...serializdQueryKeys.listRoot(), getSerializdUsername() ?? null] })
    .flatMap(([, data]) => data?.entries ?? []).find((entry) => entry.item.id === id)?.item;
}

/** Coming Soon cards carry TMDB ids, which a cold details read can't serve without a TMDB token. */
export function findInSerializdUpcomingCache(queryClient: QueryClient, id: string) {
  if (typeof window === 'undefined') return undefined;
  return queryClient.getQueriesData<SerializdUpcomingEpisode[]>({ queryKey: [...serializdQueryKeys.all, 'upcoming'] })
    .flatMap(([, data]) => data ?? []).find((episode) => episode.item.id === id)?.item;
}
