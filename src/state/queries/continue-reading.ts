import { useQuery, useQueryClient, useSuspenseQueries, type QueryKey } from '@tanstack/react-query';

import { showBridgedOnce } from '@/lib/providers/reading-bridge';
import { providersForFeed } from '@/lib/providers/routing';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { anilistQueryKeys, currentMangaEntriesOptions, fetchReadingManga } from './anilist';
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

// Module scope, and only the legs' data: `combine` runs again on every
// observer change, and its result keeps its identity while the data does.
function legInputs(results: ReadonlyArray<{ data: Leg }>): NormalizedMediaItem[][] {
  return results.map((result) => result.data.inputs);
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
 * A bridged work shows once, as its Hardcover volume (B6).
 */
export function useSuspenseContinueReadingQuery(): NormalizedMediaItem[] {
  const queryClient = useQueryClient();
  const providers = continueReadingProviders(useConnectedProviders());
  const legs = useSuspenseQueries({
    queries: [
      ...(providers.includes(Provider.AniList)
        ? [leg(Provider.AniList, anilistQueryKeys.reading(), () => fetchReadingManga(queryClient))]
        : []),
      ...(providers.includes(Provider.Hardcover)
        ? [leg(Provider.Hardcover, hardcoverQueryKeys.reading(), () => fetchHardcoverReading(queryClient))]
        : []),
    ],
    combine: legInputs,
  });
  // The whole list the AniList leg already read, so a book matches the same
  // entry here as on the reading list and the diary.
  const { data: list } = useQuery({
    ...currentMangaEntriesOptions(queryClient),
    // A reader of the list the reads keep fresh, never a second refresher.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: providers.includes(Provider.AniList) && providers.includes(Provider.Hardcover),
  });
  return showBridgedOnce(legs.flat(), list?.map((entry) => entry.item) ?? []).sort((a, b) =>
    b.lastUpdated.localeCompare(a.lastUpdated),
  );
}
