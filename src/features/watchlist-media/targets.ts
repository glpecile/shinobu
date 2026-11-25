import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import { hasLetterboxdUserscript, useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { resolveWriteTargets, splitWriteTargets, type WriteCapability } from '@/lib/providers/routing';
import type { ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

export interface WatchlistMediaVariables {
  providers?: ProviderId[];
}

export interface WatchlistWritePayload {
  item: NormalizedMediaItem;
}

export interface WatchlistWritePlan {
  item: NormalizedMediaItem;
  targets: ProviderId[];
  manual: ProviderId[];
}

export async function planWatchlistWrite(
  queryClient: QueryClient,
  item: NormalizedMediaItem,
  connected: readonly ProviderId[],
  variables: WatchlistMediaVariables = {},
): Promise<WatchlistWritePlan> {
  const enriched = await enrichExternalIds(queryClient, item, connected);
  const platform = currentPlatform();
  const letterboxdUserscript = hasLetterboxdUserscript('watchlist');

  const targets = resolveWriteTargets(enriched, connected, {
    capability: 'watchlist',
    platform,
    letterboxdUserscript,
    ...(variables.providers != null ? { onlyProviders: variables.providers } : {}),
  });
  const { manual } = splitWriteTargets(enriched, connected, platform, 'watchlist', letterboxdUserscript);

  return { item: enriched, targets, manual };
}

export function useWriteTargetsSplit(
  item: NormalizedMediaItem,
  capability: Extract<WriteCapability, 'watchlist' | 'tracking'>,
): {
  writable: ProviderId[];
  manual: ProviderId[];
  item: NormalizedMediaItem;
} {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const platform = currentPlatform();
  const letterboxdUserscript = useLetterboxdUserscript('watchlist');

  const { data: enriched = item } = useQuery({
    queryKey: ['write-targets', item.id, item.tmdbTvVariant ?? null, ...connected],
    queryFn: () => enrichExternalIds(queryClient, item, connected),
  });

  return { ...splitWriteTargets(enriched, connected, platform, capability, letterboxdUserscript), item: enriched };
}
