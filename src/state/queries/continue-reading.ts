import { useQueryClient, useSuspenseQueries, type QueryKey } from '@tanstack/react-query';

import { providersForFeed } from '@/lib/providers/routing';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, fetchReadingManga } from './anilist';
import { fetchHardcoverReading, hardcoverQueryKeys } from './hardcover';
import { settle, type ProviderContribution } from './settle';

type Leg = ProviderContribution<NormalizedMediaItem>;

/**
 * One provider's cards, with a failure settled into the data so it costs only
 * that provider's cards. The key sits under the provider's list read, so every
 * invalidation of that read (a log, a pull-to-refresh, a disconnect purge)
 * reaches this too. A refetch re-reads the cached list, which keeps its own
 * staleTime, so it costs a request only when the list is stale.
 */
function leg(provider: ProviderId, queryKey: QueryKey, read: () => Promise<NormalizedMediaItem[]>) {
  return { queryKey, queryFn: (): Promise<Leg> => settle(provider, read) };
}

// Module scope keeps the combined rail's identity between renders.
function newestFirst(results: ReadonlyArray<{ data: Leg }>): NormalizedMediaItem[] {
  return results
    .flatMap((result) => result.data.inputs)
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}

/** The connected providers that feed Continue Reading. */
export function continueReadingProviders(connected: readonly ProviderId[]): ProviderId[] {
  return providersForFeed(connected).filter(
    (provider) => provider === Provider.AniList || provider === Provider.Hardcover,
  );
}

/**
 * Home's Continue Reading rail (plan 0117 M3, B2): manga being read or reread
 * on AniList and Currently Reading books on Hardcover, newest update first
 * across both. Units never convert (KTD-3): manga count chapters, books pages.
 */
export function useSuspenseContinueReadingQuery(): NormalizedMediaItem[] {
  const queryClient = useQueryClient();
  const providers = continueReadingProviders(useConnectedProviders());
  return useSuspenseQueries({
    queries: [
      ...(providers.includes(Provider.AniList)
        ? [leg(Provider.AniList, anilistQueryKeys.reading(), () => fetchReadingManga(queryClient))]
        : []),
      ...(providers.includes(Provider.Hardcover)
        ? [leg(Provider.Hardcover, hardcoverQueryKeys.reading(), () => fetchHardcoverReading(queryClient))]
        : []),
    ],
    combine: newestFirst,
  });
}
