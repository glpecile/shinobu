import { useQueries, useQuery } from '@tanstack/react-query';

import { findAniListProgress, mergeMediaProgress, sameProgressItem, type MediaProgress } from '@/lib/media-progress';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import { useTmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';
import { useAniListLibraryQuery } from './anilist';
import { letterboxdFilmQuery, letterboxdFilmWatchQuery } from './letterboxd';
import { useSerializdWatchedShowsQuery } from './serializd';
import { findLibraryEntry, findLibraryProgress, simklLibraryQuery } from './simkl';
import { useWatchedMoviesQuery, useWatchedShowsQuery } from './trakt';

const filmLike = (item: NormalizedMediaItem) => item.type === 'MOVIE' || item.isFilm === true;

/** One selector for poster eyes, numeric progress and whole-list counts; caches are provider-owned. */
export function useMediaProgress(items: readonly NormalizedMediaItem[]) {
  const connected = useConnectedProviders();
  const hasTmdb = useTmdbToken() !== '';
  const films = useQueries({ queries: items.map((item) => letterboxdFilmQuery(
    connected.length > 0 && item.externalIds.tmdb == null && item.externalIds.letterboxd != null
      ? item.externalIds.letterboxd : null, hasTmdb,
  )) });
  const resolved = items.map((item, index) => films[index].data ?? item);
  const letterboxdUsername = connected.includes('letterboxd') ? getLetterboxdUsername() : null;
  const watches = useQueries({ queries: resolved.map((item) => letterboxdFilmWatchQuery(letterboxdUsername, item)) });
  const movies = useWatchedMoviesQuery({ enabled: connected.includes('trakt') && items.some(filmLike) });
  const shows = useWatchedShowsQuery({ enabled: connected.includes('trakt') && items.some((item) => item.type === 'TV') });
  const simkl = useQuery({ ...simklLibraryQuery(), enabled: connected.includes('simkl') && items.length > 0, throwOnError: false });
  const anilist = useAniListLibraryQuery(connected.includes('anilist') && items.length > 0);
  const serializdUsername = connected.includes('serializd') && items.some((item) => item.type === 'TV') ? getSerializdUsername() : null;
  const serializd = useSerializdWatchedShowsQuery(serializdUsername);
  const progress = resolved.map((item, index) => {
    const sources: MediaProgress[] = [];
    const add = (current: number, total: number | undefined, completed = false) => sources.push({ watched: current > 0 || completed, current, total, completed, unit: item.progressUnit });
    if (connected.includes('trakt')) {
      const match = (filmLike(item) ? movies.data : shows.data)?.find((entry) => sameProgressItem(item, entry));
      if (match != null) add(match.currentProgress, match.totalEpisodes);
    }
    if (connected.includes('simkl') && simkl.data != null) {
      const entry = findLibraryEntry(simkl.data, item);
      if (entry != null) add(findLibraryProgress(simkl.data, item) ?? 0, item.type === 'TV' && entry.item.type === 'ANIME' ? undefined : entry.item.totalEpisodes,
        filmLike(item) ? entry.status === 'completed' : item.type !== 'TV' && entry.status === 'completed');
    }
    if (connected.includes('anilist') && anilist.data != null) {
      const entry = findAniListProgress(item, anilist.data);
      if (entry != null) add(entry.item.currentProgress, item.type === 'TV' ? undefined : entry.item.totalEpisodes, item.type !== 'TV' && (entry.status === 'COMPLETED' || entry.status === 'REPEATING'));
    }
    if (letterboxdUsername != null && watches[index].data != null) add(1, 1, true);
    if (serializdUsername != null && item.type === 'TV') {
      const show = serializd.data?.find((candidate) => sameProgressItem(item, candidate.item));
      if (show != null) sources.push({ watched: true, completed: false, current: show.watchedSeasons, total: show.totalSeasons, unit: 'season' });
    }
    return mergeMediaProgress(item, sources);
  });
  const queries = [...films, ...watches, movies, shows, simkl, anilist, serializd].filter((query) => query.isEnabled);
  return {
    progress,
    connected: connected.length > 0,
    loading: queries.some((query) => query.isPending),
    failed: queries.some((query) => query.isError),
    retry: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
