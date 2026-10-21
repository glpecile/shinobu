import { useQueries, useQuery } from '@tanstack/react-query';

import { findAniListProgress, mergeMediaProgress, sameProgressItem, type MediaProgress } from '@/lib/media-progress';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';
import { useAniListLibraryQuery } from './anilist';
import { letterboxdFilmWatchQuery } from './letterboxd';
import { useMediaMetadata } from './media-metadata';
import { useSerializdWatchedShowsQuery } from './serializd';
import { findLibraryEntry, findLibraryProgress, simklLibraryQuery } from './simkl';
import { useWatchedMoviesQuery, useWatchedShowsQuery } from './trakt';

const filmLike = (item: NormalizedMediaItem) => item.type === 'MOVIE' || item.isFilm === true;

/**
 * The list-wide snapshots every progress read matches against. A list reads
 * them once and hands them to each mounted row's `useItemProgress`, rather
 * than every row subscribing to all six.
 */
export function useProgressLibraries(items: readonly NormalizedMediaItem[]) {
  const connected = useConnectedProviders();
  const anyTv = items.some((item) => item.type === 'TV');
  const letterboxdUsername = connected.includes('letterboxd') ? getLetterboxdUsername() : null;
  const serializdUsername = connected.includes('serializd') && anyTv ? getSerializdUsername() : null;
  return {
    connected,
    letterboxdUsername,
    serializdUsername,
    movies: useWatchedMoviesQuery({ enabled: connected.includes('trakt') && items.some(filmLike) }),
    shows: useWatchedShowsQuery({ enabled: connected.includes('trakt') && anyTv }),
    simkl: useQuery({ ...simklLibraryQuery(), enabled: connected.includes('simkl') && items.length > 0, throwOnError: false }),
    anilist: useAniListLibraryQuery(connected.includes('anilist') && items.length > 0),
    serializd: useSerializdWatchedShowsQuery(serializdUsername),
  };
}

export type ProgressLibraries = ReturnType<typeof useProgressLibraries>;

/** One selector for poster eyes, numeric progress and whole-list counts; caches are provider-owned. */
export function useMediaProgress(items: readonly NormalizedMediaItem[]) {
  return useItemProgress(items, useProgressLibraries(items));
}

/** Per-item reads (film identity, Letterboxd viewing) matched against shared libraries. */
export function useItemProgress(items: readonly NormalizedMediaItem[], libraries: ProgressLibraries) {
  const { connected, letterboxdUsername, serializdUsername, movies, shows, simkl, anilist, serializd } = libraries;
  const { items: resolved, queries: films } = useMediaMetadata(items, connected.length > 0);
  const watches = useQueries({ queries: resolved.map((item) => letterboxdFilmWatchQuery(letterboxdUsername, item)) });
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
  // A member-film 404 can be an undated watch, not evidence of non-membership.
  const incomplete = watches.some((query, index) => query.isEnabled && query.isSuccess && query.data == null && !progress[index].completed);
  return {
    items: resolved,
    progress,
    connected: connected.length > 0,
    loading: queries.some((query) => query.isPending || query.isFetching),
    failed: queries.some((query) => query.isError),
    incomplete,
    retry: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
