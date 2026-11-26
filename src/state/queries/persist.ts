import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import type { Query, QueryClient } from '@tanstack/react-query';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import { anilistQueryKeys } from './anilist';
import { diaryQueryKeys } from './diary-pages';
import { hardcoverQueryKeys } from './hardcover';
import { letterboxdQueryKeys } from './letterboxd';
import { serializdQueryKeys } from './serializd';
import { simklQueryKeys } from './simkl';
import { traktQueryKeys } from './trakt';
import { upNextQueryKeys } from './up-next';
import { watchlistQueryKeys } from './watchlist';

/** Synchronous MMKV snapshot for the home feed and its supporting reads. */

const STORAGE_ID = 'query-cache';

const PERSIST_KEY = 'shinobu.query-cache';

/** Bump when a persisted query's key or data shape makes old snapshots incompatible. */
const BUSTER = 'v9';

const MAX_AGE_MS = 24 * 60 * 60_000;

let cache: MMKV | null = null;

/**
 * Lazy and never on the server: MMKV falls back to `localStorage` on web,
 * which doesn't exist during Expo Router's SSR pass
 * (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md). Every op degrades
 * to a no-op there, so a server render simply restores nothing.
 */
function storage(): MMKV | null {
  if (typeof window === 'undefined') return null;
  cache ??= createMMKV({ id: STORAGE_ID });
  return cache;
}

/** Encode Sets explicitly so show progress restores its watched keys. */
const SET_TAG = '@@set';

/** Encode Maps explicitly so ani.zip episode tables restore as maps. */
const MAP_TAG = '@@map';

interface TaggedSet {
  [SET_TAG]: unknown[];
}

interface TaggedMap {
  [MAP_TAG]: [unknown, unknown][];
}

function isTaggedSet(value: unknown): value is TaggedSet {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<TaggedSet>)[SET_TAG])
  );
}

function isTaggedMap(value: unknown): value is TaggedMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<TaggedMap>)[MAP_TAG])
  );
}

/**
 * Infinite queries keep only their first page on disk: a restored infinite
 * query refetches every page it holds, so a deep scroll would otherwise cost
 * a cold start one request per page before the screen settles.
 */
function firstPagesOnly(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) => {
        const data = query.state.data as { pages?: unknown; pageParams?: unknown } | undefined;
        if (!Array.isArray(data?.pages) || !Array.isArray(data.pageParams)) return query;
        return {
          ...query,
          state: {
            ...query.state,
            data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
          },
        };
      }),
    },
  };
}

export function serialize(client: PersistedClient): string {
  return JSON.stringify(firstPagesOnly(client), (_key, value: unknown) => {
    if (value instanceof Set) return { [SET_TAG]: [...value] };
    if (value instanceof Map) return { [MAP_TAG]: [...value] };
    return value;
  });
}

export function deserialize(cached: string): PersistedClient {
  return JSON.parse(cached, (_key, value: unknown) => {
    if (isTaggedSet(value)) return new Set(value[SET_TAG]);
    if (isTaggedMap(value)) return new Map(value[MAP_TAG]);
    return value;
  }) as PersistedClient;
}

/** Allowlist cache entries needed on cold start. Keep unbounded reads out of the snapshot. */
const PERSISTED_PREFIXES: readonly (readonly unknown[])[] = [
  upNextQueryKeys.inputs(),
  watchlistQueryKeys.inputs(),
  traktQueryKeys.watchedShows(),
  traktQueryKeys.showProgress(0).slice(0, -1),
  // Restore AniList's viewer id with the list to avoid a gating request.
  anilistQueryKeys.viewer(),
  anilistQueryKeys.currentAnimeEntries(),
  anilistQueryKeys.currentMangaEntries(),
  hardcoverQueryKeys.reading(),
  // Keep these literal prefixes aligned with mappingQueryKeys. Importing its module loads the
  // provider read stack at startup.
  ['mapping', 'anizip'],
  ['mapping', 'anizip-episodes'],
  traktQueryKeys.watchedMovies(),
  simklQueryKeys.trending('movies').slice(0, -1),
  simklQueryKeys.trending('tv').slice(0, -1),
  anilistQueryKeys.seasonalAnime({ season: 'WINTER', year: 0 }).slice(0, -3),
  letterboxdQueryKeys.watchlist('').slice(0, -1),
  // Letterboxd persists film identities and positive watch evidence. Null leaves watch state
  // unknown.
  letterboxdQueryKeys.slug(0).slice(0, -1),
  letterboxdQueryKeys.film('').slice(0, -1),
  letterboxdQueryKeys.filmWatchesRoot(),
  letterboxdQueryKeys.listsRoot(),
  serializdQueryKeys.listsRoot(),
  // The Diary tab, so it opens on the last session's entries. Native only:
  // Simkl's 500-entry window alone can approach a megabyte, more than web's
  // `localStorage` can spare beside the rest of the snapshot.
  ...(process.env.EXPO_OS === 'web' ? [] : [diaryQueryKeys.feedRoot()]),
];

function hasPrefix(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((segment, index) => key[index] === segment);
}

export function isPersistedQueryKey(key: readonly unknown[]): boolean {
  return PERSISTED_PREFIXES.some((prefix) => hasPrefix(key, prefix));
}

/**
 * Persisted entries stay cached as long as a snapshot may be restored, so a
 * mid-session eviction can't write them out of the next launch's snapshot.
 * Everything else keeps TanStack's five-minute eviction.
 */
export function retainPersistedQueries(queryClient: QueryClient): QueryClient {
  for (const prefix of PERSISTED_PREFIXES)
    queryClient.setQueryDefaults(prefix, { gcTime: MAX_AGE_MS });
  return queryClient;
}

export function shouldPersistQuery(query: Query): boolean {
  // A cold streamed gather is successful before its last provider has arrived.
  const streaming = query.queryKey[0] === 'up-next' || query.queryKey[0] === 'watchlist';
  return (
    query.state.status === 'success' &&
    (!streaming || query.state.fetchStatus === 'idle') &&
    isPersistedQueryKey(query.queryKey)
  );
}

export function createQueryPersister(): Persister {
  return createSyncStoragePersister({
    key: PERSIST_KEY,
    // The provider batches before dehydration; do not delay the disk write again.
    throttleTime: 0,
    serialize,
    deserialize,
    storage: {
      getItem: (key) => storage()?.getString(key) ?? null,
      setItem: (key, value) => {
        storage()?.set(key, value);
      },
      removeItem: (key) => {
        storage()?.remove(key);
      },
    },
  });
}

export const persistOptions = {
  buster: BUSTER,
  maxAge: MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
    // A mutation that waits in its `scope` is paused. Restored, it has no
    // `mutationFn` and fails on the next focus.
    shouldDehydrateMutation: () => false,
  },
} as const;
