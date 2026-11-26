import type { QueryClient } from '@tanstack/react-query';

import { watchlistMergeKeys } from '@/features/watchlist/compute';
import { Provider } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { titleKey } from '@/lib/providers/pick-movie-match';
import type { LetterboxdListFilmsPage } from '@/lib/providers/letterboxd/lists';

import { cachedDiaryEntries } from './diary-pages';

export const WATCHLIST_QUERY_ROOT = ['watchlist'] as const;

export function findInWatchlistCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{ inputs?: Array<{ item: NormalizedMediaItem }> }>({
      queryKey: WATCHLIST_QUERY_ROOT,
    })
    .flatMap(([, data]) => data?.inputs ?? [])
    .find((input) => input?.item?.id === id)?.item;
}

export function findLetterboxdTwinInCache(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
): NormalizedMediaItem | undefined {
  const keys = new Set(watchlistMergeKeys(item));
  const candidates = [
    ...queryClient
      .getQueriesData<{ inputs?: Array<{ item: NormalizedMediaItem; source?: string }> }>({
        queryKey: WATCHLIST_QUERY_ROOT,
      })
      .flatMap(([, data]) => data?.inputs ?? [])
      .filter((input) => input?.source === Provider.Letterboxd)
      .map((input) => input.item),
    ...cachedDiaryEntries(queryClient)
      .filter((entry) => entry?.provider === Provider.Letterboxd)
      .map((entry) => entry.item),
    ...queryClient
      .getQueriesData<NormalizedMediaItem[]>({ queryKey: [Provider.Letterboxd, 'watchlist'] })
      .flatMap(([, data]) => data ?? []),
    ...queryClient
      .getQueriesData<{ pages: NormalizedMediaItem[][] }>({
        queryKey: [Provider.Letterboxd, 'watchlist-pages'],
      })
      .flatMap(([, data]) => data?.pages.flat() ?? []),
    ...queryClient
      .getQueriesData<{ pages: LetterboxdListFilmsPage[] }>({
        queryKey: [Provider.Letterboxd, 'list-films'],
      })
      .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? []),
    ...queryClient
      .getQueriesData<NormalizedMediaItem | null>({ queryKey: [Provider.Letterboxd, 'film'] })
      .flatMap(([, data]) => (data == null ? [] : [data])),
  ];
  if (item.type === 'TV' || (item.type === 'ANIME' && item.isFilm !== true)) {
    const twins = new Map(
      candidates
        .filter((twin) => twin?.externalIds?.letterboxd != null)
        .map((twin) => [twin.externalIds.letterboxd, twin]),
    );
    const matches = [...twins.values()].filter((twin) => {
      if (twin.tmdbTvVariant != null) return twin.tmdbTvVariant === item.externalIds.tmdb;
      if (twin.externalIds.tmdb != null) return false;
      return (
        item.year != null &&
        twin.year === item.year &&
        titleKey(twin.title) === titleKey(item.title)
      );
    });
    return matches.length === 1 ? matches[0] : undefined;
  }
  return candidates.find(
    (twin) =>
      twin?.externalIds?.letterboxd != null &&
      watchlistMergeKeys(twin).some((key) => keys.has(key)),
  );
}
