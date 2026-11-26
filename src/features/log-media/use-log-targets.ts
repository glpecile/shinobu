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
  unmatched: ProviderId[];
  enriched: NormalizedMediaItem | undefined;
}

export function currentPlatform(): string {
  return process.env.EXPO_OS ?? '';
}

export function useLogTargetsSplit(item: NormalizedMediaItem): LogTargetsSplit {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();
  const letterboxdUserscript = useLetterboxdUserscript();

  const { data, isError } = useQuery({
    queryKey: [
      'log-targets',
      item.id,
      item.tmdbTvVariant ?? null,
      ...connected,
      platform,
      letterboxdUserscript,
    ],
    queryFn: async () => {
      const enriched = await enrichExternalIds(queryClient, item, connected);
      return {
        ...splitWriteTargets(enriched, connected, platform, 'log', letterboxdUserscript),
        unmatched: unmatchedWriteTargets(enriched, connected),
        enriched,
      };
    },
  });

  return (
    data ?? {
      ...splitWriteTargets(item, connected, platform, 'log', letterboxdUserscript),
      unmatched: [],
      enriched: isError ? item : undefined,
    }
  );
}

export function useTargetSelection(targets: readonly ProviderId[]) {
  const [deselected, setDeselected] = useState<readonly ProviderId[]>([]);
  const selected = targets.filter((id) => !deselected.includes(id));
  const setSelected = (next: readonly ProviderId[]) =>
    setDeselected(targets.filter((id) => !next.includes(id)));
  return [selected, setSelected] as const;
}
