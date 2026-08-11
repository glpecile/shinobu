import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import { anilistQueryKeys } from './anilist';
import { letterboxdQueryKeys } from './letterboxd';
import { simklQueryKeys } from './simkl';
import { traktQueryKeys } from './trakt';
import { upNextQueryKeys } from './up-next';
import { watchlistQueryKeys } from './watchlist';

/**
 * Disk-backed query cache (MMKV, synchronous, universal). The point is
 * perceived latency on cold start: Up Next is a ~6-round-trip waterfall
 * (watched-shows, then a bounded fan of per-show progress calls), so without a
 * restored cache the home screen shows a skeleton for the whole thing. With
 * one, the last session's inputs render immediately and the waterfall runs as
 * a background revalidation behind them.
 *
 * A separate MMKV file from both `state/session` (auth) and `state/prefs`
 * (cosmetic): this one is derived data and is safe to nuke at any time —
 * a `buster` bump does exactly that.
 */

/** Its own file, so clearing the cache can never touch tokens or preferences. */
const STORAGE_ID = 'query-cache';

/** The single entry the whole dehydrated cache is written under. */
const PERSIST_KEY = 'shinobu.query-cache';

/**
 * Bump to discard every persisted entry — the escape hatch for a normalizer or
 * query-key change that would otherwise restore data in the old shape.
 */
// v2 (plan 0030): `UpNextInputs` gained required `traktCalendar`/`releases`
// arrays and `AniListCurrentEntry` gained `status`. Both keys are persisted, so
// without this bump a snapshot written by the previous build restores in the
// old shape and `computeUpNext` throws on `inputs.traktCalendar.map` during the
// first render after upgrade — taking the whole Up Next section down with it.
// v3 (plan 0031): `watchlistQueryKeys.inputs()` joins the allowlist below with a
// shape that has never been on disk. The bump is the established procedure for
// a new persisted shape, and here it also guarantees the first restore after
// upgrade can't hand `computeWatchlist` a snapshot written before the key
// existed. `WatchlistInputs` is arrays only — no `Set`-shaped value
// (docs/solutions/persisted-query-cache-set-and-map-corruption.md).
// v4 (the `Map` codec below): every snapshot written before it holds ani.zip
// episode maps as `{}`, and a codec only fixes what it *writes* — restoring an
// older snapshot would keep crashing the anime details screen for anyone who
// already has one on disk. Discarding them is exactly what this constant is for.
// v5 (plan 0034 U8): `UpNextInputs` went provider-keyed — `trakt`/
// `traktCalendar` became `progress`/`calendar`. Same failure mode as the v2
// bump: a pre-U8 snapshot restores without those arrays and `computeUpNext`
// throws on `inputs.progress.map` during the first render after upgrade.
const BUSTER = 'v5';

/** Older than this and the whole snapshot is dropped rather than restored. */
const MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Writes are debounced: `persistQueryClient` re-dehydrates on every cache
 * event, and the Up Next fan alone fires ~20 of those in a burst.
 */
const THROTTLE_MS = 2_000;

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

/**
 * `JSON.stringify` turns a `Set` into `{}` — silently. `show-progress` carries
 * its watched episodes as `Set<string>` (`watchedKeys`), so persisting it
 * without this codec would restore an object with no `.has`, and the details
 * screen's per-episode ticks would throw on the first cached read. Tagged
 * round-trip instead of a `superjson` dependency: one shape, ~10 lines.
 */
const SET_TAG = '@@set';

/**
 * `Map` is the same trap, and it bit for real: `['mapping','anizip-episodes']`
 * has been on the allowlist since the home-feed restore landed, and
 * `AniZipEpisodeMap` is a `ReadonlyMap` (`lib/providers/mapping/anizip.ts`).
 * With no codec it restored as `{}`, and `canonicalSeasonTitle`'s
 * `map.size === 0` guard **passed** — `undefined === 0` is false — so the next
 * line called `map.values()` and threw "undefined is not a function" on every
 * cold-started anime details screen with an ani.zip map.
 *
 * That is why this codec is the fix rather than a null-guard at the call site:
 * the guard would turn a corrupted map into a silently *wrong* answer (no
 * season title) instead of a loud one, and every future `Map` consumer would
 * inherit the same bug. The allowlist note below says to add the tag before
 * persisting anything exotic; this is that tag, arriving late.
 */
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

export function serialize(client: PersistedClient): string {
  return JSON.stringify(client, (_key, value: unknown) => {
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

/**
 * Key prefixes worth writing to disk — an **allowlist**, deliberately. Most of
 * the cache is either unbounded (search results, per-item details, TMDB
 * credits) or worthless cold, and web's `localStorage` fallback has a few MB to
 * spend. Everything here is on the home screen's critical path.
 *
 * Built from the key builders wherever importing one is cheap, so a key rename
 * can't silently stop persisting; `.slice(0, -n)` drops a builder's trailing
 * argument segments to leave the prefix every instance shares.
 */
const PERSISTED_PREFIXES: readonly (readonly unknown[])[] = [
  // The Up Next slot itself — the one that makes the home screen instant.
  upNextQueryKeys.inputs(),
  // The cross-provider watchlist gather (plan 0031 KTD-11). Without it this is
  // the one home row that pops in as a skeleton after every cold start while
  // the rest of the feed restores together — and `useIsWatchlisted` would be
  // `undefined` on the first details screen after a restart, which is exactly
  // the "correct after an app restart" claim the settled label rests on.
  watchlistQueryKeys.inputs(),
  // Its Trakt half: the pool source, then the per-show fan it drives.
  traktQueryKeys.watchedShows(),
  traktQueryKeys.showProgress(0).slice(0, -1),
  // Its AniList half. `viewer` is forever-cached, so restoring it saves the
  // one request that gates the currently-watching read.
  anilistQueryKeys.viewer(),
  anilistQueryKeys.currentAnimeEntries(),
  // Identity mappings never churn (they're already `Infinity`-cached in
  // memory), and Up Next fans one per anime for cross-provider dedupe.
  // Literals, not `mappingQueryKeys`: importing `./mapping` here would drag
  // the TMDB/Trakt/AniList read modules into the app root for two prefixes,
  // and its partial stubs in the log-media suites break anything that does.
  // `mappingQueryKeys` writes these bare too — keep the two in step.
  ['mapping', 'anizip'],
  ['mapping', 'anizip-episodes'],
  // The remaining home rows, so the whole feed restores together rather than
  // Up Next popping in ahead of a screen of skeletons.
  traktQueryKeys.watchedMovies(),
  simklQueryKeys.trending('movies').slice(0, -1),
  simklQueryKeys.trending('tv').slice(0, -1),
  anilistQueryKeys.seasonalAnime({ season: 'WINTER', year: 0 }).slice(0, -2),
  letterboxdQueryKeys.watchlist('').slice(0, -1),
];

function hasPrefix(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((segment, index) => key[index] === segment);
}

/** The allowlist check on its own — the half worth unit-testing. */
export function isPersistedQueryKey(key: readonly unknown[]): boolean {
  return PERSISTED_PREFIXES.some((prefix) => hasPrefix(key, prefix));
}

/** Errored and pending queries are never written: only settled data restores. */
export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === 'success' && isPersistedQueryKey(query.queryKey);
}

export function createQueryPersister(): Persister {
  return createSyncStoragePersister({
    key: PERSIST_KEY,
    throttleTime: THROTTLE_MS,
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
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
} as const;
