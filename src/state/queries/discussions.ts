import { useQueries } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import { getDiscussionCatalog, matchDiscussionThreads, type DiscussionBoard } from '@/lib/http/fourchan';
import type { NormalizedMediaItem } from '@/types/media';

export const discussionQueryKeys = {
  catalog: (board: DiscussionBoard) => ['discussions', board] as const,
};

/** Aggregate independent board results so empty/failed catalogs leave no section. */
export function useDiscussionsQuery(
  boards: DiscussionBoard[],
  item: NormalizedMediaItem,
  season?: number,
  number?: number,
) {
  return useQueries({
    queries: boards.map((board) => ({
      queryKey: discussionQueryKeys.catalog(board),
      queryFn: ({ signal }) => Effect.runPromise(getDiscussionCatalog(httpFetch, board), { signal }),
      staleTime: 60_000,
      retry: false,
      select: (catalog: Parameters<typeof matchDiscussionThreads>[0]) =>
        matchDiscussionThreads(catalog, item, season, number).map((thread) => ({ board, thread })),
    })),
    combine: (results) => results.flatMap((result) => result.data ?? []),
  });
}
