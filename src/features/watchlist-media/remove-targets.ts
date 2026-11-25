import type { QueryClient } from '@tanstack/react-query';

import { enrichExternalIds } from '@/features/log-media/enrich';
import { currentPlatform } from '@/features/log-media/use-log-targets';
import type { WatchlistEntry } from '@/features/watchlist/types';
import { hasLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { providersForWrite, removalItem, splitWriteTargets } from '@/lib/providers/routing';
import { Provider, type ProviderId } from '@/lib/providers/types';
import type { ProviderFailure } from '@/state/queries/settle';
import { watchlistReadProviders } from '@/state/queries/watchlist';
import type { NormalizedMediaItem } from '@/types/media';

export interface UnwatchlistMediaVariables {
  providers?: ProviderId[];
  /** Providers whose destructive-delete refusal guard the user explicitly confirmed lifting. */
  destructive?: ProviderId[];
}

export interface WatchlistRemovePayload {
  item: NormalizedMediaItem;
  destructive?: readonly ProviderId[];
}

export interface WatchlistRemovePlan {
  item: NormalizedMediaItem;
  targets: ProviderId[];
  manual: ProviderId[];
  unknown: ProviderId[];
}

export function hasWatchlistReadLeg(
  provider: ProviderId,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[],
  incomplete: readonly ProviderId[] = [],
): boolean {
  if (!watchlistReadProviders(connected).includes(provider)) return false;
  if (incomplete.includes(provider)) return false;
  return !errors.some((failure) => failure.provider === provider);
}

export function splitWatchlistRemoveTargets(
  item: NormalizedMediaItem,
  sources: readonly ProviderId[],
  connected: readonly ProviderId[],
  platform: string,
  errors: readonly ProviderFailure[],
  incomplete: readonly ProviderId[] = [],
  letterboxdUserscript = false,
): { item: NormalizedMediaItem; targets: ProviderId[]; manual: ProviderId[]; unknown: ProviderId[] } {
  const routed = removalItem(item, sources);
  const { writable, manual } = splitWriteTargets(
    routed,
    connected,
    platform,
    'watchlist-remove',
    letterboxdUserscript,
  );
  const probe =
    item.bridgedAniList != null && !hasWatchlistReadLeg(Provider.AniList, connected, errors, incomplete)
      ? removalItem(item, [...sources, Provider.AniList])
      : routed;
  const unknown = providersForWrite(probe, connected, 'watchlist-remove').filter(
    (provider) =>
      !sources.includes(provider) &&
      !hasWatchlistReadLeg(provider, connected, errors, incomplete),
  );
  return {
    item: routed,
    targets: writable.filter((provider) => sources.includes(provider)),
    manual: manual.filter((provider) => sources.includes(provider)),
    unknown,
  };
}

export async function planWatchlistRemove(
  queryClient: QueryClient,
  entry: WatchlistEntry,
  connected: readonly ProviderId[],
  errors: readonly ProviderFailure[] = [],
  variables: UnwatchlistMediaVariables = {},
  incomplete: readonly ProviderId[] = [],
): Promise<WatchlistRemovePlan> {
  const base = entry.item.type === 'BOOK' ? entry.item : await enrichExternalIds(queryClient, entry.item, connected);
  const platform = currentPlatform();

  const split = splitWatchlistRemoveTargets(
    base,
    entry.sources,
    connected,
    platform,
    errors,
    incomplete,
    hasLetterboxdUserscript('watchlist-remove'),
  );
  const only = variables.providers;
  const targets =
    only == null || only.length === 0
      ? split.targets
      : split.targets.filter((provider) => only.includes(provider));

  return { item: split.item, targets, manual: split.manual, unknown: split.unknown };
}

export function shouldOfferWatchlistAdd(
  entry: Pick<WatchlistEntry, 'item' | 'sources'>,
  connected: readonly ProviderId[],
  platform: string,
  errors: readonly ProviderFailure[] = [],
  incomplete: readonly ProviderId[] = [],
): boolean {
  const { writable, manual } = splitWriteTargets(
    entry.item,
    connected,
    platform,
    'watchlist',
  );
  return [...writable, ...manual].some(
    (provider) =>
      !entry.sources.includes(provider) &&
      hasWatchlistReadLeg(provider, connected, errors, incomplete),
  );
}
