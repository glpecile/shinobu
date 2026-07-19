import { useQuery, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import {
  fetchAniZipIds,
  type AniZipLookup,
} from '@/lib/providers/mapping/anizip';
import { pickMovieMatch } from '@/lib/providers/pick-movie-match';
import { findByTvdbId } from '@/lib/providers/tmdb/reads';
import { lookupByExternalId, searchMedia } from '@/lib/providers/trakt/reads';
import type { NormalizedMediaItem } from '@/types/media';

import { tmdbDeps } from './tmdb';
import { traktDeps } from './trakt';

/**
 * Cross-provider identity lookups (plan 0011 decisions 5–6): ani.zip bridges
 * AniList ↔ TVDB/TMDB/IMDB, and Trakt `/search` turns foreign ids or a
 * title+year into a full catalogue record. Every lookup is cached forever
 * (mappings don't churn) and degrades to `null` on a miss. Shared by the log
 * fan-out (features/log-media/enrich.ts) and the details screen's metadata
 * enrichment — both hit the same cache entries.
 */

export const mappingQueryKeys = {
  anizip: (lookup: AniZipLookup) => ['mapping', 'anizip', lookup] as const,
  traktLookup: (source: string, id: number | string, kind: string) =>
    ['mapping', 'trakt-lookup', source, id, kind] as const,
  traktSearch: (title: string, year: number | undefined) =>
    ['mapping', 'trakt-search', title, year ?? 'any'] as const,
  /** TVDB → TMDB tv-id bridge (`/find`), the anime-TV leg of plan 0014. */
  tmdbFind: (tvdbId: number) => ['mapping', 'tmdb-find', tvdbId] as const,
};

const FOREVER = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

export function cachedAniZipIds(queryClient: QueryClient, lookup: AniZipLookup) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.anizip(lookup),
    queryFn: () => fetchAniZipIds(httpFetch, lookup),
    ...FOREVER,
  });
}

export function cachedTraktLookup(
  queryClient: QueryClient,
  params: {
    source: 'tvdb' | 'tmdb' | 'imdb';
    id: number | string;
    kind: 'movie' | 'show';
  },
) {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.traktLookup(params.source, params.id, params.kind),
    queryFn: () =>
      Effect.runPromise(lookupByExternalId(traktDeps(), params)).catch(() => null),
    ...FOREVER,
  });
}

/**
 * Resolve a movie's full Trakt catalogue record (metadata + Trakt/TMDB/IMDB
 * ids) from its title+year via Trakt text search — the bridge for items whose
 * origin provider carries no cross-id at all (a Letterboxd watchlist film is
 * just a slug + title + year). Which result counts as *the* film is
 * `pickMovieMatch`'s year-gated call — never the raw top hit
 * (docs/solutions/trakt-text-search-wrong-movie-match.md). A miss resolves
 * to `null`.
 */
function movieSearchQuery(title: string, year: number | undefined) {
  return {
    queryKey: mappingQueryKeys.traktSearch(title, year),
    queryFn: (): Promise<NormalizedMediaItem | null> =>
      // limit 10, not 5: an upcoming film can rank below a popular classic
      // sharing its title, and the year gate needs it in the result set.
      Effect.runPromise(searchMedia(traktDeps(), { query: title, limit: 10 }))
        .then((results) => pickMovieMatch(results, year))
        .catch(() => null),
    ...FOREVER,
  };
}

/**
 * TVDB id → TMDB tv id via TMDB `/find` — how a TV anime (ani.zip maps those
 * to TVDB, not TMDB) acquires the id the TMDB-first detail read needs.
 * Forever-cached like every mapping; null on a miss or without a TMDB token.
 */
export function cachedTmdbTvIdByTvdb(
  queryClient: QueryClient,
  tvdbId: number,
): Promise<number | null> {
  return queryClient.fetchQuery({
    queryKey: mappingQueryKeys.tmdbFind(tvdbId),
    queryFn: (): Promise<number | null> =>
      Effect.runPromise(findByTvdbId(tmdbDeps(), { tvdbId })).catch(() => null),
    ...FOREVER,
  });
}

export function cachedTraktTextSearch(
  queryClient: QueryClient,
  title: string,
  year: number | undefined,
) {
  return queryClient.fetchQuery(movieSearchQuery(title, year));
}

/**
 * Catalogue record backing a movie that arrived without one — today that's
 * Letterboxd items, whose origin carries no overview/runtime/genres/rating
 * and no cross-provider ids. Disabled once the item already has a Trakt id
 * (it *is* a catalogue record then). Merge the result with
 * `mergeCatalogueMetadata` (lib/providers/merge-metadata.ts).
 */
export function useMovieCatalogueQuery(item: NormalizedMediaItem | undefined) {
  const title = item?.title ?? '';
  return useQuery({
    ...movieSearchQuery(title, item?.year),
    enabled:
      item != null &&
      item.type === 'MOVIE' &&
      item.externalIds.trakt == null &&
      title !== '',
  });
}

/**
 * Trakt catalogue record for an item that knows its TMDB id but not its
 * Trakt one — today that's a filmography credit opened from the person
 * screen (TMDB-normalized, so MOVIE/TV only). The discovered record merges
 * in via `mergeCatalogueMetadata`, lighting up the trakt-id-keyed detail
 * sections (seasons, cast, studios). Shares its cache entry with the
 * fan-out's `cachedTraktLookup`.
 */
export function useTraktIdentityQuery(item: NormalizedMediaItem | undefined) {
  const tmdbId = item?.externalIds.tmdb;
  const kind = item?.type === 'TV' ? 'show' : 'movie';
  return useQuery({
    queryKey: mappingQueryKeys.traktLookup('tmdb', tmdbId ?? 0, kind),
    queryFn: (): Promise<NormalizedMediaItem | null> =>
      Effect.runPromise(
        lookupByExternalId(traktDeps(), { source: 'tmdb', id: tmdbId ?? 0, kind }),
      ).catch(() => null),
    ...FOREVER,
    enabled:
      item != null &&
      (item.type === 'MOVIE' || item.type === 'TV') &&
      item.externalIds.trakt == null &&
      tmdbId != null,
  });
}
