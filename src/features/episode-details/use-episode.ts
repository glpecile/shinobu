import {
  useShowSeasonsQuery,
  useShowSeasonsSource,
} from '@/state/queries/show-seasons';
import { useTmdbEpisodeQuery } from '@/state/queries/tmdb';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedEpisode, NormalizedMediaItem } from '@/types/media';

import { episodeNeighbours, type EpisodeRef } from './episode-neighbours';

export interface EpisodeView {
  /** Undefined while neither the seasons list nor TMDB has answered. */
  episode: NormalizedEpisode | undefined;
  /** The episodes either side in the show's layout; absent at the ends or before it loads. */
  prev?: EpisodeRef;
  next?: EpisodeRef;
  /** Wide still from TMDB; '' until it answers or when there is none. */
  still: string;
  rating?: number;
  isLoading: boolean;
  /** Whether the credit sections can be fetched at all (id + token). */
  tmdbId: number | undefined;
}

/**
 * What the episode header renders, TMDB-over-catalogue like the details
 * screen's `applyPrimaryMetadata`: the seasons list (already cached by the
 * accordion this was opened from) answers instantly, TMDB sharpens the title,
 * overview and adds the still. The air instant stays the catalogue's when it
 * has one — Trakt carries a real time, TMDB only a date.
 */
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
    ...(tmdb.data?.rating != null ? { rating: tmdb.data.rating } : {}),
    isLoading: episode == null && (seasons.isPending || tmdb.isPending),
    tmdbId,
  };
}
