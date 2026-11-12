import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { splitWriteTargets, unmatchedWriteTargets } from '@/lib/providers/routing';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import { enrichExternalIds } from './enrich';

interface LogTargetsSplit {
  writable: ProviderId[];
  manual: ProviderId[];
  /** Connected providers no id reaches for this anime. Empty until the id lookup has answered. */
  unmatched: ProviderId[];
}

/** `process.env.EXPO_OS` is always one of these at runtime; '' never matches a platform flag. */
export function currentPlatform(): string {
  return process.env.EXPO_OS ?? '';
}

/**
 * The providers a log of `item` would actually target, *after* identity
 * enrichment (plan 0011) — split into what the fan-out can write on this
 * platform and what can only be logged manually (plan 0022 R1/R2, e.g.
 * Letterboxd on web). Falls back to the unenriched split while the mapping
 * loads (it only ever widens). The mutation runs the same enrichment through
 * the same cache, so confirming doesn't refetch. Unmatched providers come only
 * from the enriched answer, because before it every anime looks unmatched.
 */
export function useLogTargetsSplit(item: NormalizedMediaItem): LogTargetsSplit {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();
  const letterboxdUserscript = useLetterboxdUserscript();

  const { data } = useQuery({
    queryKey: ['log-targets', item.id, item.tmdbTvVariant ?? null, ...connected, platform, letterboxdUserscript],
    queryFn: async () => {
      const enriched = await enrichExternalIds(queryClient, item, connected);
      return {
        ...splitWriteTargets(enriched, connected, platform, 'log', letterboxdUserscript),
        unmatched: unmatchedWriteTargets(enriched, connected),
      };
    },
  });

  return data ?? { ...splitWriteTargets(item, connected, platform, 'log', letterboxdUserscript), unmatched: [] };
}

/**
 * A log sheet's provider selection over `targets`. It keeps the user's
 * opt-outs, not a copy of the targets, so a target the id lookup adds after
 * the sheet opens starts selected.
 */
export function useTargetSelection(targets: readonly ProviderId[]) {
  const [deselected, setDeselected] = useState<readonly ProviderId[]>([]);
  const selected = targets.filter((id) => !deselected.includes(id));
  const setSelected = (next: readonly ProviderId[]) => setDeselected(targets.filter((id) => !next.includes(id)));
  return [selected, setSelected] as const;
}
