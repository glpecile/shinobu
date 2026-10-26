import { useSuspenseQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { tmdbKindFor } from '@/lib/providers/media-details';
import { getWikidataRatings, type WikidataLookup } from '@/lib/providers/wikidata/ratings';
import type { NormalizedMediaItem } from '@/types/media';

export const wikidataQueryKeys = {
  all: ['wikidata'] as const,
  ratings: (lookup: WikidataLookup) => [...wikidataQueryKeys.all, 'ratings', lookup] as const,
};

/** Volunteers update these scores every few months or years, so a day costs nothing. */
const RATINGS_CACHE_MS = 24 * 60 * 60_000;

/**
 * Rotten Tomatoes and Metacritic scores for the details Ratings section,
 * looked up by MAL/AniList id for anime and by TMDB id otherwise.
 */
export function wikidataRatingsLookup(item: NormalizedMediaItem): WikidataLookup {
  const kind = tmdbKindFor(item.type, item.isFilm);
  const { tmdb, mal, anilist } = item.externalIds;
  // Anime ids first: an AniList entry is one cour while TMDB's match is the
  // whole series, and the TMDB id only arrives with the catalogue, which would
  // re-key (and refetch) the lookup mid-screen. P4086 and P8729 are MAL's and
  // AniList's *anime* ids; manga has its own.
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
