import {
  useShowSeasonsQuery,
  useShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useTmdbEpisodeQuery } from '@/state/queries/tmdb';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedEpisode, NormalizedMediaItem, NormalizedRating } from '@/types/media';

import { episodeNeighbours, episodeOrder, type EpisodeRef } from './episode-neighbours';

export interface EpisodeView {
  episode: NormalizedEpisode | undefined;
  prev?: EpisodeRef;
  next?: EpisodeRef;
  still: string;
  ratings?: NormalizedRating[];
  isLoading: boolean;
  tmdbId: number | undefined;
  order: EpisodeRef[];
}

/** Merges TMDB metadata over the cached season entry, preserving catalogue `firstAired` since Trakt provides timestamps while TMDB only provides dates. */
export function useEpisode(
  item: NormalizedMediaItem,
  season: number,
  number: number,
): EpisodeView {
  const hasTmdb = useTmdbToken() !== '';
  const tmdbId = hasTmdb ? item.externalIds.tmdb : undefined;
  const source = useShowSeasonsSource(item);
  const seasons = useShowSeasonsQuery(source);
  const tmdb = useTmdbEpisodeQuery({ tmdbId, season, number });
  const listed = seasons.data
    ?.find((entry) => entry.number === season)
    ?.episodes.find((entry) => entry.number === number);
  const fetched = tmdb.data?.episode;
  const episode =
    listed == null && fetched == null
      ? undefined
      : {
          ...listed,
          ...fetched,
          number,
          title: fetched?.title ?? listed?.title ?? `Episode ${number}`,
          ...(listed?.firstAired != null ? { firstAired: listed.firstAired } : {}),
        };
  return {
    episode,
    ...(seasons.data == null ? {} : episodeNeighbours(seasons.data, season, number)),
    still: tmdb.data?.still ?? '',
    ...(tmdb.data?.ratings != null ? { ratings: tmdb.data.ratings } : {}),
    isLoading: episode == null && (seasons.isPending || tmdb.isPending),
    tmdbId,
    order: seasons.data == null ? [] : episodeOrder(seasons.data, season),
  };
}
