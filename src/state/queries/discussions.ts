import { queryOptions, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { httpFetch } from '@/lib/http/client';
import { getDiscussionCatalog, matchDiscussionThreads, type DiscussionBoard } from '@/lib/http/fourchan';
import { getSubredditSearch, subredditPostUrl, type DiscussionSubreddit } from '@/lib/http/reddit';
import type { NormalizedMediaItem } from '@/types/media';

export const discussionQueryKeys = {
  catalog: (board: DiscussionBoard) => ['discussions', board] as const,
  subreddit: (subreddit: DiscussionSubreddit, term: string) => ['discussions', 'reddit', subreddit, term] as const,
};

type Catalog = Parameters<typeof matchDiscussionThreads>[0];

function matcher(item: NormalizedMediaItem, season?: number, number?: number) {
  return (catalog: Catalog) => matchDiscussionThreads(catalog, item, season, number);
}

/** Aggregate independent board results so empty/failed catalogs leave no section. */
export function useDiscussionsQuery(
  boards: DiscussionBoard[],
  item: NormalizedMediaItem,
  season?: number,
  number?: number,
) {
  const match = matcher(item, season, number);
  return useQueries({
    queries: boards.map((board) => ({
      queryKey: discussionQueryKeys.catalog(board),
      queryFn: ({ signal }) => Effect.runPromise(getDiscussionCatalog(httpFetch, board), { signal }),
      staleTime: 60_000,
      retry: false,
      select: (catalog: Catalog) => match(catalog).map((thread) => ({
        key: `${board}-${thread.id}`,
        site: '4chan',
        meta: `/${board}/ · #${thread.id}`,
        accessibilityPlace: `/${board}/, thread ${thread.id}`,
        url: `https://boards.4chan.org/${board}/thread/${thread.id}`,
        thread,
      })),
    })),
    combine: (results) => ({
      threads: results.flatMap((result) => result.data ?? []),
      isFetching: results.some((result) => result.isFetching),
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  });
}

/**
 * Suspends only while loading. A rate limit or block page stays in the cache
 * as no posts rather than throwing, because React logs every boundary-caught
 * error (LogBox on native); Refresh refetches it.
 */
export function useSuspenseRedditDiscussionsQuery(
  subreddit: DiscussionSubreddit,
  term: string,
  item: NormalizedMediaItem,
  season?: number,
  number?: number,
) {
  const client = useQueryClient();
  const match = matcher(item, season, number);
  const options = queryOptions({
    queryKey: discussionQueryKeys.subreddit(subreddit, term),
    queryFn: ({ signal }) => Effect.runPromise(getSubredditSearch(httpFetch, subreddit, term), { signal }),
    // Reddit's logged-out budget is about one search a minute per IP, so a
    // failure waits for Refresh instead of retrying on the next mount.
    staleTime: 10 * 60_000,
    retry: false,
    retryOnMount: false,
    throwOnError: false,
  });
  const query = useQuery({
    ...options,
    select: (catalog) => match(catalog).map((thread) => ({
      key: `reddit-${thread.id}`,
      site: 'Reddit',
      meta: `r/${subreddit}`,
      accessibilityPlace: `r/${subreddit}`,
      url: subredditPostUrl(subreddit, thread.id),
      thread,
    })),
  });
  if (query.isPending) throw client.prefetchQuery(options);
  return query.data ?? [];
}
