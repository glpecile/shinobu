import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useSyncExternalStore } from 'react';

import { getTvSeasons } from '@/lib/providers/tmdb/reads';
import { getShowSeasons } from '@/lib/providers/trakt/reads';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { hasBuilderTmdbToken, tmdbToken } from '@/state/session/tmdb-token';
import { onSessionChange } from '@/state/session/tokens';
import type { NormalizedMediaItem, NormalizedSeason } from '@/types/media';

import { tmdbDeps, tmdbQueryKeys } from './tmdb';
import { traktDeps, traktQueryKeys } from './trakt';

/**
 * Which catalogue answers a TV show's seasons + episodes. Trakt when its
 * credentials exist (BYO post-detachment — plan 0034 KTD-8): it carries true
 * air *instants* and matches the progress read's numbering. TMDB otherwise —
 * the same catalogue substitute the mapping layer uses, needing only the
 * builder token; live probes (plan 0027) found the two agreeing on season
 * structure, so either source serves the log fan-out's canonical numbering.
 * `null` means no source can answer and the seasons UI stays hidden.
 */
export type ShowSeasonsSource =
  | { source: 'trakt'; traktId: number }
  | { source: 'tmdb'; tmdbId: number };

function seasonsSourceFor(
  item: NormalizedMediaItem,
  traktUsable: boolean,
  tmdbUsable: boolean,
): ShowSeasonsSource | null {
  const traktId = item.externalIds.trakt;
  if (traktId != null && traktUsable) return { source: 'trakt', traktId };
  const tmdbId = item.externalIds.tmdb;
  if (tmdbId != null && tmdbUsable) return { source: 'tmdb', tmdbId };
  return null;
}

/**
 * Subscribed to the session store so saving BYO Trakt credentials or a TMDB
 * token mid-session re-routes an already-mounted details screen (the
 * `mapping.ts` via-hook pattern). SSR snapshots never touch MMKV — only the
 * builder TMDB token can be known on the server.
 */
export function useShowSeasonsSource(
  item: NormalizedMediaItem,
): ShowSeasonsSource | null {
  const traktUsable = useSyncExternalStore(
    onSessionChange,
    () => getClientIdForProvider('trakt') !== '',
    () => false,
  );
  const tmdbUsable = useSyncExternalStore(
    onSessionChange,
    () => tmdbToken() !== '',
    hasBuilderTmdbToken,
  );
  return seasonsSourceFor(item, traktUsable, tmdbUsable);
}

/** Trakt shares `traktQueryKeys.seasons` with the pre-existing hooks —
 *  whichever mounts first fills the cache for both. The widened `queryKey`
 *  type lets the two sources' literal key tuples share one options shape. */
function showSeasonsQueryOptions(source: ShowSeasonsSource): {
  queryKey: readonly unknown[];
  queryFn: () => Promise<NormalizedSeason[]>;
} {
  return source.source === 'trakt'
    ? {
        queryKey: traktQueryKeys.seasons(source.traktId),
        queryFn: (): Promise<NormalizedSeason[]> =>
          Effect.runPromise(
            getShowSeasons(traktDeps(), { traktId: source.traktId }),
          ),
      }
    : {
        queryKey: tmdbQueryKeys.seasons(source.tmdbId),
        queryFn: (): Promise<NormalizedSeason[]> =>
          Effect.runPromise(getTvSeasons(tmdbDeps(), { tmdbId: source.tmdbId })),
      };
}

/**
 * Full seasons + episodes from whichever source `useShowSeasonsSource`
 * resolved (plan 0010's suspense contract, source-widened for plan 0034).
 * Mount under a `SuspenseSection`, only with a non-null source.
 */
export function useSuspenseShowSeasonsQuery(source: ShowSeasonsSource) {
  return useSuspenseQuery(showSeasonsQueryOptions(source));
}

/**
 * Non-suspense sibling sharing the same cache entries — the series-runtime
 * stat tile reads the resolved structure without blocking the screen; the
 * suspense section drives the fetch. Accepts `null` (renders nothing there)
 * so callers can hook unconditionally.
 */
export function useShowSeasonsQuery(source: ShowSeasonsSource | null) {
  return useQuery({
    ...(source != null
      ? showSeasonsQueryOptions(source)
      : {
          queryKey: ['show-seasons', 'none'] as const,
          queryFn: (): Promise<NormalizedSeason[]> => Promise.resolve([]),
        }),
    enabled: source != null,
  });
}
