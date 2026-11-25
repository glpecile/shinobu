import { useSuspenseQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import { tmdbKindFor } from '@/lib/providers/media-details';
import { getWikidataRatings, type WikidataLookup } from '@/lib/providers/wikidata/ratings';
import type { NormalizedMediaItem } from '@/types/media';

export const wikidataQueryKeys = {
  all: ['wikidata'] as const,
  ratings: (lookup: WikidataLookup) => [...wikidataQueryKeys.all, 'ratings', lookup] as const,
};

const RATINGS_CACHE_MS = 24 * 60 * 60_000;

export function wikidataRatingsLookup(item: NormalizedMediaItem): WikidataLookup {
  const kind = tmdbKindFor(item.type, item.isFilm);
  const { tmdb, mal, anilist } = item.externalIds;
  // Prefer anime ids over TMDB (AniList is per-cour, TMDB is whole-series); Wikidata P4086/P8729 are anime-only.
  return item.type === 'ANIME' && (mal != null || anilist != null)
    ? { ...(mal != null ? { mal } : {}), ...(anilist != null ? { anilist } : {}) }
    : tmdb != null && kind != null
      ? { tmdb: { kind, id: tmdb } }
      : {};
}

export function useSuspenseWikidataRatingsQuery(item: NormalizedMediaItem) {
  const lookup = wikidataRatingsLookup(item);
  return useSuspenseQuery({
    queryKey: wikidataQueryKeys.ratings(lookup),
    queryFn: ({ signal }) => Effect.runPromise(getWikidataRatings({ fetch: httpFetch }, lookup), { signal }),
    staleTime: RATINGS_CACHE_MS,
    gcTime: RATINGS_CACHE_MS,
    retry: false,
  });
}
