import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { LogMediaVariables } from '@/features/log-media/fan-out';
import { prefetchLogReconcile } from '@/features/log-media/use-log-media';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';

type ReconcileVariables = Pick<LogMediaVariables, 'item' | 'episodes' | 'entryEpisodes' | 'providers'>;

export const logReconcileQueryKeys = {
  warm: (connected: readonly ProviderId[], variables: ReconcileVariables) =>
    ['log-reconcile', connected, variables] as const,
};

/** Best-effort warming of the mutation's provider caches for the displayed episode. */
export function useLogReconcileQuery(variables: ReconcileVariables, enabled: boolean) {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  return useQuery({
    queryKey: logReconcileQueryKeys.warm(connected, variables),
    queryFn: async () => {
      await prefetchLogReconcile(queryClient, connected, variables);
      return null;
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
