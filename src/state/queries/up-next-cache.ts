import type { QueryClient } from '@tanstack/react-query';

import type { NormalizedMediaItem } from '@/types/media';

export const UP_NEXT_QUERY_ROOT = ['up-next'] as const;

export function findInUpNextCache(
  queryClient: QueryClient,
  id: string,
): NormalizedMediaItem | undefined {
  return queryClient
    .getQueriesData<{
      progress?: Array<{ item: NormalizedMediaItem }>;
      calendar?: Array<{ item: NormalizedMediaItem }>;
      releases?: Array<{ item: NormalizedMediaItem }>;
    }>({ queryKey: UP_NEXT_QUERY_ROOT })
    .flatMap(([, data]) => [
      ...(data?.progress ?? []),
      ...(data?.calendar ?? []),
      ...(data?.releases ?? []),
    ])
    .find((input) => input?.item?.id === id)?.item;
}
