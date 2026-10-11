import { useQueryClient } from '@tanstack/react-query';

import { simklEpisodeIsWatched } from '@/lib/providers/simkl/episode-state';
import { useLetterboxdFilmQuery } from '@/state/queries/letterboxd';
import { useAniListEpisodeWatchedQuery } from '@/state/queries/mapping';
import { useMediaDetailsQuery } from '@/state/queries/media-details';
import { useSerializdProgressQuery } from '@/state/queries/serializd';
import { useShowSeasonsQuery, useShowSeasonsSource } from '@/state/queries/show-seasons';
import { useSimklEpisodeStateQuery } from '@/state/queries/simkl';
import { useTraktShowProgressQuery } from '@/state/queries/trakt';
import { findLetterboxdTwinInCache } from '@/state/queries/watchlist-cache';
import { useConnectedProviders } from '@/state/session';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';
import { letterboxdCompletionRequest } from './letterboxd-completion';

/** Confirmed writes supplement the snapshot only after their entire report is clean. */
export function useLetterboxdCompletion(item: NormalizedMediaItem) {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const twin = item.type === 'TV' && connected.includes('letterboxd')
    ? findLetterboxdTwinInCache(queryClient, item) : undefined;
  const enabled = twin != null;
  const film = useLetterboxdFilmQuery(twin?.externalIds.letterboxd ?? null);
  const details = useMediaDetailsQuery(enabled ? item : undefined);
  const source = useShowSeasonsSource(item);
  const seasons = useShowSeasonsQuery(enabled ? source : null);
  const trakt = useTraktShowProgressQuery({ traktId: item.externalIds.trakt, enabled: enabled && connected.includes('trakt') });
  const simkl = useSimklEpisodeStateQuery({ item, enabled: enabled && connected.includes('simkl') });
  const serializd = useSerializdProgressQuery(item.externalIds.tmdb, enabled && connected.includes('serializd') ? getSerializdUsername() : null);
  const anilist = useAniListEpisodeWatchedQuery({ item, enabled: enabled && connected.includes('anilist') && item.externalIds.anilist != null });

  return (confirmed: readonly { season?: number; number: number }[] = []) => {
    if (!enabled || film.isError || details.isError || seasons.isError) return null;
    const watched = new Set<string>();
    for (const season of seasons.data ?? []) {
      for (const episode of season.episodes) {
        const key = `${season.number}-${episode.number}`;
        if ((connected.includes('trakt') && !trakt.isError && trakt.data?.watchedKeys.has(key)) ||
          (connected.includes('simkl') && !simkl.isError && simklEpisodeIsWatched(simkl.data, season.number, episode.number, episode.firstAired)) ||
          (connected.includes('serializd') && !serializd.isError && serializd.data?.has(key)) ||
          (connected.includes('anilist') && !anilist.isError && anilist.data.has(key))) watched.add(key);
      }
    }
    return letterboxdCompletionRequest(item, film.data, details.data?.catalogue, seasons.data, watched, confirmed);
  };
}
