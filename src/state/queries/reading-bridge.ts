import { isCancelledError, type QueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { searchReadingWorks } from '@/lib/providers/anilist/reads';
import {
  bridgeQueries,
  pickBridgeMatch,
  type BridgeCandidate,
  type BridgeMatch,
} from '@/lib/providers/reading-bridge';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistDeps } from './anilist';
import { mediaDetailsQuery } from './media-details';

export const readingBridgeQueryKeys = {
  /** A title → AniList `MANGA` entries with staff and volumes. */
  search: (query: string) => ['mapping', 'anilist-reading-search', query] as const,
};

/**
 * The AniList entry a Hardcover book is a volume of (plan 0117 B5), or null.
 * Reads the book's title, authors and series from the details cache, then
 * searches AniList for each of `bridgeQueries`. Each search is cached for
 * the session, misses included.
 */
export async function cachedReadingBridge(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
): Promise<BridgeMatch | null> {
  try {
    const details = await queryClient.fetchQuery(mediaDetailsQuery(queryClient, item));
    const book = {
      title: details.catalogue?.title ?? item.title,
      authors: details.crew.map((person) => person.name),
      ...(details.series != null ? { series: details.series } : {}),
    };
    const results: BridgeCandidate[] = [];
    // One at a time: AniList allows 30 a minute.
    for (const query of bridgeQueries(book)) {
      results.push(
        ...(await queryClient.fetchQuery({
          queryKey: readingBridgeQueryKeys.search(query),
          queryFn: ({ signal }) => Effect.runPromise(searchReadingWorks(anilistDeps(), { query }), { signal }),
          staleTime: Number.POSITIVE_INFINITY,
          gcTime: Number.POSITIVE_INFINITY,
          retry: false,
        })),
      );
    }
    return pickBridgeMatch(book, results);
  } catch (error) {
    if (isCancelledError(error)) throw error;
    return null;
  }
}
