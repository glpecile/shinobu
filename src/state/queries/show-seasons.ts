import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import { useSyncExternalStore } from 'react';

import { getTvSeasons } from '@/lib/providers/tmdb/reads';
import { getShowSeasons } from '@/lib/providers/trakt/reads';
import { Provider } from '@/lib/providers/types';
import { getClientIdForProvider } from '@/state/session/provider-config';
import { hasBuilderTmdbToken, tmdbToken } from '@/state/session/tmdb-token';
import { onSessionChange } from '@/state/session/tokens';
import type { NormalizedMediaItem, NormalizedSeason } from '@/types/media';

import { tmdbDeps, tmdbQueryKeys } from './tmdb';
import { traktDeps, traktQueryKeys } from './trakt';

export type ShowSeasonsSource =
  { source: typeof Provider.Trakt; traktId: number } | { source: 'tmdb'; tmdbId: number };

export function seasonsSourceFor(
  item: Pick<NormalizedMediaItem, 'externalIds'>,
  traktUsable = getClientIdForProvider(Provider.Trakt) !== '',
  tmdbUsable = tmdbToken() !== '',
): ShowSeasonsSource | null {
  const traktId = item.externalIds.trakt;
  if (traktId != null && traktUsable) return { source: Provider.Trakt, traktId };
  const tmdbId = item.externalIds.tmdb;
  if (tmdbId != null && tmdbUsable) return { source: 'tmdb', tmdbId };
  return null;
}

export function useShowSeasonsSource(
  item: Pick<NormalizedMediaItem, 'externalIds'> | null | undefined,
): ShowSeasonsSource | null {
  const traktUsable = useSyncExternalStore(
    onSessionChange,
    () => getClientIdForProvider(Provider.Trakt) !== '',
    () => false,
  );
  const tmdbUsable = useSyncExternalStore(
    onSessionChange,
    () => tmdbToken() !== '',
    hasBuilderTmdbToken,
  );
  if (item == null) return null;
  return seasonsSourceFor(item, traktUsable, tmdbUsable);
}

export function showSeasonsQueryOptions(source: ShowSeasonsSource): {
  queryKey: readonly unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<NormalizedSeason[]>;
  staleTime: number;
  gcTime: number;
} {
  const cache = { staleTime: SEASONS_STALE_TIME_MS, gcTime: SEASONS_STALE_TIME_MS };
  return source.source === Provider.Trakt
    ? {
        queryKey: traktQueryKeys.seasons(source.traktId),
        queryFn: ({ signal }): Promise<NormalizedSeason[]> =>
          Effect.runPromise(getShowSeasons(traktDeps(), { traktId: source.traktId }), { signal }),
        ...cache,
      }
    : {
        queryKey: tmdbQueryKeys.seasons(source.tmdbId),
        queryFn: ({ signal }): Promise<NormalizedSeason[]> =>
          Effect.runPromise(getTvSeasons(tmdbDeps(), { tmdbId: source.tmdbId }), { signal }),
        ...cache,
      };
}

const SEASONS_STALE_TIME_MS = 60 * 60 * 1000;

export function useSuspenseShowSeasonsQuery(source: ShowSeasonsSource) {
  return useSuspenseQuery(showSeasonsQueryOptions(source));
}

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
