import { useSuspenseInfiniteQuery, useSuspenseQuery, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSerializdList, getSerializdListsPage, type SerializdListEntry, type SerializdListKind } from '@/lib/providers/serializd/lists';
import { serializdBaseUrl, serializdFetch } from '@/lib/providers/serializd/transport';
import type { SerializdDeps } from '@/lib/providers/serializd/deps';
import { getSerializdSession, getSerializdUsername } from '@/state/session/serializd';

/**
 * Real dependency wiring for Serializd effects — same state → lib/providers
 * arrow as `traktDeps()`/`letterboxdDeps()`. The transport (`fetch` + `baseUrl`)
 * is the platform seam (KTD4): native reaches the upstream host with app
 * headers, web the same-origin proxy. Works on every platform (R13) — no
 * `EXPO_OS` gate.
 */
export function serializdDeps(): SerializdDeps {
  return {
    fetch: serializdFetch,
    baseUrl: serializdBaseUrl,
    session: getSerializdSession(),
  };
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
  all: ['serializd'] as const,
  listsRoot: () => [...serializdQueryKeys.all, 'lists'] as const,
  lists: (username: string, kind: SerializdListKind) => [...serializdQueryKeys.listsRoot(), username, kind] as const,
  listRoot: () => [...serializdQueryKeys.all, 'list'] as const,
  list: (username: string | null, id: string) => [...serializdQueryKeys.listRoot(), username, id] as const,
  progress: (username: string, tmdbId: number) =>
    [...serializdQueryKeys.all, 'progress', username, tmdbId] as const,
};

/** Home and View all share pages; only View all fetches successors. */
export function useSuspenseSerializdListsQuery(username: string, kind: SerializdListKind) {
  return useSuspenseInfiniteQuery({
    queryKey: serializdQueryKeys.lists(username, kind),
    queryFn: ({ pageParam, signal }) => Effect.runPromise(getSerializdListsPage(serializdDeps(), { username, kind, page: pageParam }), { signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, page) => lastPage.hasNextPage && page < 9999 ? page + 1 : undefined,
    staleTime: 15 * 60_000,
  });
}

export function useSuspenseSerializdListQuery(username: string | null, id: string) {
  return useSuspenseQuery({
    queryKey: serializdQueryKeys.list(username, id),
    queryFn: ({ signal }) => Effect.runPromise(getSerializdList(serializdDeps(), id), { signal }),
    staleTime: 15 * 60_000,
  });
}

/** Cache-only resolution keeps list entries usable even without a TMDB token. */
export function findInSerializdListsCache(queryClient: QueryClient, id: string) {
  // Same username source as the detail query's key (`getSerializdUsername()`),
  // so a connected-but-invalid session never hides a cached hit.
  return queryClient.getQueriesData<{ entries: SerializdListEntry[] }>({ queryKey: [...serializdQueryKeys.listRoot(), getSerializdUsername() ?? null] })
    .flatMap(([, data]) => data?.entries ?? []).find((entry) => entry.item.id === id)?.item;
}
