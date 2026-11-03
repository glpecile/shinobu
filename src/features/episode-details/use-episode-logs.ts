import { Provider, type ProviderId } from '@/lib/providers/types';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { useSimklEpisodeStateQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useAniListEpisodeWatchedQuery } from '@/state/queries/mapping';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

export interface EpisodeLog {
  provider: ProviderId;
  /** ISO instant of the latest play; absent when the provider kept none. */
  watchedAt?: string;
}

/**
 * Watched state from Trakt, Simkl, and the item's mapped AniList entry.
 * AniList's progress proves a watch but carries no per-episode timestamp.
 * Its mapping and progress reads share the anime accordion's query cache.
 */
export function useEpisodeLogs(
  item: NormalizedMediaItem,
  season: number,
  number: number,
  /** Completion only implies aired episodes within the entry's mapped seasons. */
  firstAired: string | undefined,
): EpisodeLog[] {
  const connected = useConnectedProviders();
  const key = `${season}-${number}`;
  const trakt = useTraktShowProgressQuery({
    traktId: item.externalIds.trakt ?? undefined,
    enabled: connected.includes(Provider.Trakt),
  });
  const simkl = useSimklEpisodeStateQuery({
    item,
    enabled: connected.includes(Provider.Simkl),
  });
  const anilist = useAniListEpisodeWatchedQuery({
    item,
    enabled: connected.includes(Provider.AniList),
  });
  const logs: EpisodeLog[] = [];
  if (anilist.data.has(key)) logs.push({ provider: Provider.AniList });
  if (trakt.data?.watchedKeys.has(key)) {
    const watchedAt = trakt.data.lastWatchedAt?.[key];
    logs.push({ provider: Provider.Trakt, ...(watchedAt != null ? { watchedAt } : {}) });
  }
  const simklEpisode = simkl.data?.watchedEpisodes.find(
    (entry) => entry.season === season && entry.number === number,
  );
  if (simklEpisode != null) {
    logs.push({
      provider: Provider.Simkl,
      ...(simklEpisode.watchedAt != null ? { watchedAt: simklEpisode.watchedAt } : {}),
    });
  } else if (
    simklEpisodeIsWatched(simkl.data, season, number, firstAired)
  ) {
    logs.push({ provider: Provider.Simkl });
  }
  return logs;
}
