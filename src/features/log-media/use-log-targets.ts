import { useQuery, useQueryClient } from '@tanstack/react-query';

import { providersForLog } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';

/**
 * The providers a log of `item` would actually fan out to, *after* identity
 * enrichment — so the confirm sheet's "Writes to …" shows Trakt for a mapped
 * anime instead of under-reporting (plan 0011). Falls back to the unenriched
 * routing while the mapping loads (it only ever widens). The mutation runs
 * the same enrichment through the same cache, so confirming doesn't refetch.
 */
export function useLogTargets(item: NormalizedMediaItem): ProviderId[] {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['log-targets', item.id, ...connected],
    queryFn: async () =>
      providersForLog(await enrichExternalIds(queryClient, item, connected), connected),
  });

  return data ?? providersForLog(item, connected);
}
