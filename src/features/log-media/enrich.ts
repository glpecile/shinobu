import type { QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { fetchAniZipIds, type AniZipLookup } from '@/lib/providers/mapping/anizip';
import { lookupByExternalId } from '@/lib/providers/trakt/reads';
import type { ProviderId } from '@/lib/providers/types';
import { traktDeps } from '@/state/queries/trakt';
import type { NormalizedMediaItem } from '@/types/media';

/**
 * Cross-provider identity enrichment (plan 0011 decisions 5–6): before the
 * log fan-out routes, fill in the ids the item's origin provider couldn't
 * know — ani.zip bridges AniList ↔ TVDB/TMDB/IMDB, and a Trakt `/search`
 * lookup turns those into a real Trakt id. Every lookup is cached forever
 * (mappings don't churn) and degrades to "no widening" on a miss, so an
 * unmappable item just logs to its origin provider.
 */

export const mappingQueryKeys = {
  anizip: (lookup: AniZipLookup) => ['mapping', 'anizip', lookup] as const,
  traktLookup: (source: string, id: number | string, kind: string) =>
    ['mapping', 'trakt-lookup', source, id, kind] as const,
};

const FOREVER = { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY };

function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
  });
}

function cachedTraktLookup(
  queryClient: QueryClient,
  params: { source: 'tvdb' | 'tmdb' | 'imdb'; id: number | string; kind: 'movie' | 'show' },
) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.traktLookup(params.source, params.id, params.kind),
    queryFn: () =>
      Effect.runPromise(lookupByExternalId(traktDeps(), params)).catch(() => null),
    ...FOREVER,
  });
}

export async function enrichExternalIds(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
): Promise<NormalizedMediaItem> {
  let externalIds = { ...item.externalIds };

  const isAnime = item.type === 'ANIME';
  const isMovieTv = item.type === 'MOVIE' || item.type === 'TV';

  // AniList-origin anime → movie/TV-side ids (only useful when a movie/TV
  // provider is connected).
  if (
    isAnime &&
    externalIds.anilist != null &&
    externalIds.trakt == null &&
    externalIds.tmdb == null &&
    externalIds.tvdb == null &&
    connected.includes('trakt')
  ) {
    const mapped = await cachedAniZipIds(queryClient, {
      anilistId: externalIds.anilist,
    });
    if (mapped != null) {
      externalIds = {
        ...externalIds,
        ...(mapped.tvdb != null ? { tvdb: mapped.tvdb } : {}),
        ...(mapped.tmdb != null ? { tmdb: mapped.tmdb } : {}),
        ...(mapped.imdb != null ? { imdb: mapped.imdb } : {}),
      };
    }
  }

  // Bridge ids → a real Trakt id (progress reads and cache invalidation key
  // on it; /sync/history alone could live off tvdb/tmdb).
  if (isAnime && externalIds.trakt == null && connected.includes('trakt')) {
    const kind = item.isFilm === true ? 'movie' : 'show';
    const lookup =
      kind === 'show' && externalIds.tvdb != null
        ? { source: 'tvdb' as const, id: externalIds.tvdb }
        : externalIds.tmdb != null
          ? { source: 'tmdb' as const, id: externalIds.tmdb }
          : externalIds.imdb != null
            ? { source: 'imdb' as const, id: externalIds.imdb }
            : null;
    if (lookup != null) {
      const found = await cachedTraktLookup(queryClient, { ...lookup, kind });
      if (found?.externalIds.trakt != null) {
        externalIds = { ...externalIds, trakt: found.externalIds.trakt };
      }
    }
  }

  // Trakt-origin movie/TV → reverse-map into AniList's world.
  if (isMovieTv && externalIds.anilist == null && connected.includes('anilist')) {
    const lookup: AniZipLookup | null =
      item.type === 'TV' && externalIds.tvdb != null
        ? { tvdbId: externalIds.tvdb }
        : item.type === 'MOVIE' && externalIds.tmdb != null
          ? { tmdbId: externalIds.tmdb }
          : null;
    if (lookup != null) {
      const mapped = await cachedAniZipIds(queryClient, lookup);
      if (mapped?.anilist != null) {
        externalIds = { ...externalIds, anilist: mapped.anilist };
      }
    }
  }

  return { ...item, externalIds };
}
