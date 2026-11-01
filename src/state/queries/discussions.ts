import { useQueries } from '@tanstack/react-query';
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

/** Aggregate independent board and subreddit results so empty/failed sources leave no section. */
export function useDiscussionsQuery(
  boards: DiscussionBoard[],
  reddit: { subreddit: DiscussionSubreddit; term: string },
  item: NormalizedMediaItem,
  season?: number,
  number?: number,
) {
  const match = (catalog: Catalog) => matchDiscussionThreads(catalog, item, season, number);
  return useQueries({
    queries: [
      ...boards.map((board) => ({
        queryKey: discussionQueryKeys.catalog(board),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          Effect.runPromise(getDiscussionCatalog(httpFetch, board), { signal }),
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
      {
        queryKey: discussionQueryKeys.subreddit(reddit.subreddit, reddit.term),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          Effect.runPromise(getSubredditSearch(httpFetch, reddit.subreddit, reddit.term), { signal }),
        // Reddit's logged-out budget is about one search a minute per IP.
        staleTime: 10 * 60_000,
        retry: false,
        select: (catalog: Catalog) => match(catalog).map((thread) => ({
          key: `reddit-${thread.id}`,
          site: 'Reddit',
          meta: `r/${reddit.subreddit}`,
          accessibilityPlace: `r/${reddit.subreddit}`,
          url: subredditPostUrl(reddit.subreddit, thread.id),
          thread,
        })),
      },
    ],
    combine: (results) => ({
      threads: results.flatMap((result) => result.data ?? []),
      isFetching: results.some((result) => result.isFetching),
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  });
}
