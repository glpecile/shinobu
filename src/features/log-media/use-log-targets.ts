import { useQuery, useQueryClient } from '@tanstack/react-query';

import { splitLogTargets } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';

interface LogTargetsSplit {
  writable: ProviderId[];
  manual: ProviderId[];
}

/** `process.env.EXPO_OS` is always one of these at runtime; '' never matches a platform flag. */
function currentPlatform(): string {
  return process.env.EXPO_OS ?? '';
}

/**
 * The providers a log of `item` would actually target, *after* identity
 * enrichment (plan 0011) — split into what the fan-out can write on this
 * platform and what can only be logged manually (plan 0022 R1/R2, e.g.
 * Letterboxd on web). Falls back to the unenriched split while the mapping
 * loads (it only ever widens). The mutation runs the same enrichment through
 * the same cache, so confirming doesn't refetch.
 */
export function useLogTargetsSplit(item: NormalizedMediaItem): LogTargetsSplit {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();

  const { data } = useQuery({
    queryKey: ['log-targets', item.id, ...connected, platform],
    queryFn: async () =>
      splitLogTargets(await enrichExternalIds(queryClient, item, connected), connected, platform),
  });

  return data ?? splitLogTargets(item, connected, platform);
}

/** The writable subset of `useLogTargetsSplit` — what every existing "Writes to …" call site wants. */
export function useLogTargets(item: NormalizedMediaItem): ProviderId[] {
  return useLogTargetsSplit(item).writable;
}
