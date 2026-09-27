import type { ProviderId } from '@/lib/providers/types';
import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { useSimklEpisodeStateQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

export interface EpisodeLog {
  provider: ProviderId;
  /** ISO instant of the latest play; absent when the provider kept none. */
  watchedAt?: string;
}

/**
 * Which connected providers record this episode as watched, and when — from
 * the two that expose per-episode state on a read: Trakt's progress (its
 * `last_watched_at`) and Simkl's library snapshot (`episode_watched_at`).
 * Both are the same cache entries the seasons accordion draws its watched marks
 * from, so this costs no extra request.
 *
 * ponytail: Serializd and AniList only expose episode logs through the
 * paginated diary — add a `findInDiaryCache` step here if their rows are wanted.
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
    enabled: connected.includes('trakt'),
  });
  const simkl = useSimklEpisodeStateQuery({
    item,
    enabled: connected.includes('simkl'),
  });
  const logs: EpisodeLog[] = [];
  if (trakt.data?.watchedKeys.has(key)) {
    const watchedAt = trakt.data.lastWatchedAt?.[key];
    logs.push({ provider: 'trakt', ...(watchedAt != null ? { watchedAt } : {}) });
  }
  const simklEpisode = simkl.data?.watchedEpisodes.find(
    (entry) => entry.season === season && entry.number === number,
  );
  if (simklEpisode != null) {
    logs.push({
      provider: 'simkl',
      ...(simklEpisode.watchedAt != null ? { watchedAt: simklEpisode.watchedAt } : {}),
    });
  } else if (
    simklEpisodeIsWatched(simkl.data, season, number, firstAired)
  ) {
    logs.push({ provider: 'simkl' });
  }
  return logs;
}
