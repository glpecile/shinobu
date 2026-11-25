import { Provider } from '@/lib/providers/types';
import { useSimklLibraryEntryQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';
import {
  nextEpisodeFromProgress,
  nextEpisodeFromSimklEntry,
  type SeriesNextEpisode,
} from './series-next-episode';

export type SeriesNextEpisodeState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; episode: SeriesNextEpisode };

export function useSeriesNextEpisode(
  item: NormalizedMediaItem | null,
): SeriesNextEpisodeState {
  const connected = useConnectedProviders();
  const traktConnected = connected.includes(Provider.Trakt);
  const simklConnected = connected.includes(Provider.Simkl);
  const isSeries = item?.type === 'TV';
  const traktId = isSeries ? item.externalIds.trakt : undefined;
  const traktUsable = traktConnected && traktId != null;
  const progress = useTraktShowProgressQuery({
    traktId,
    enabled: traktConnected,
  });
  const simklEntry = useSimklLibraryEntryQuery({
    item: isSeries ? item : null,
    enabled: simklConnected && !traktUsable,
  });

  if (item == null || !isSeries) return { status: 'unavailable' };

  if (traktUsable) {
    if (progress.isError) return { status: 'unavailable' };
    if (progress.data == null) return { status: 'loading' };
    return { status: 'ready', episode: nextEpisodeFromProgress(progress.data) };
  }

  if (!simklConnected) return { status: 'unavailable' };
  if (simklEntry.isError) return { status: 'unavailable' };
  if (simklEntry.data === undefined) return { status: 'loading' };
  const entryItem = simklEntry.data?.item;
  const episode = nextEpisodeFromSimklEntry(
    {
      currentProgress: entryItem?.currentProgress ?? item.currentProgress,
      totalEpisodes: entryItem?.totalEpisodes ?? item.totalEpisodes ?? null,
      releaseDate: item.releaseDate ?? null,
    },
    simklEntry.data,
  );
  if (episode == null) return { status: 'unavailable' };
  return { status: 'ready', episode };
}
