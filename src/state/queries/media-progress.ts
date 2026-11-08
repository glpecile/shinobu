import { useQueries, useQuery } from '@tanstack/react-query';

import { findAniListProgress, findProgressRow, indexLibrary, mergeMediaProgress, type MediaProgress } from '@/lib/media-progress';
import { Provider } from '@/lib/providers/types';
import { useConnectedProviders } from '@/state/session';
import { getLetterboxdUsername } from '@/state/session/letterboxd';
import { getSerializdUsername } from '@/state/session/serializd';
import type { NormalizedMediaItem } from '@/types/media';
import { useAniListLibraryQuery } from './anilist';
import { letterboxdFilmWatchQuery } from './letterboxd';
import { useMediaMetadata } from './media-metadata';
import { useSerializdWatchedShowsQuery } from './serializd';
import { findLibraryEntry, findLibraryProgress, indexSimklLibrary, simklLibraryQuery } from './simkl';
import { useWatchedMoviesQuery, useWatchedShowsQuery } from './trakt';

const filmLike = (item: NormalizedMediaItem) => item.type === 'MOVIE' || item.isFilm === true;
const self = (item: NormalizedMediaItem) => item;
const entryItem = (entry: { item: NormalizedMediaItem }) => entry.item;

/**
 * The list-wide snapshots every progress read matches against, each indexed
 * once per snapshot. A list reads them once and hands them to each mounted
 * row's `useItemProgress`, rather than every row subscribing to all six.
 */
export function useProgressLibraries(items: readonly NormalizedMediaItem[]) {
  const connected = useConnectedProviders();
  const anyTv = items.some((item) => item.type === 'TV');
  const letterboxdUsername = connected.includes(Provider.Letterboxd) ? getLetterboxdUsername() : null;
  const serializdUsername = connected.includes(Provider.Serializd) && anyTv ? getSerializdUsername() : null;
  const movies = useWatchedMoviesQuery({ enabled: connected.includes(Provider.Trakt) && items.some(filmLike) });
  const shows = useWatchedShowsQuery({ enabled: connected.includes(Provider.Trakt) && anyTv });
  const simkl = useQuery({ ...simklLibraryQuery(), enabled: connected.includes(Provider.Simkl) && items.length > 0, throwOnError: false });
  const anilist = useAniListLibraryQuery(connected.includes(Provider.AniList) && items.length > 0);
  const serializd = useSerializdWatchedShowsQuery(serializdUsername);
  return {
    connected,
    letterboxdUsername,
    serializdUsername,
    queries: { movies, shows, simkl, anilist, serializd },
    // React Compiler rebuilds each index only when its snapshot changes.
    indexes: {
      movies: movies.data == null ? null : indexLibrary(movies.data, self),
      shows: shows.data == null ? null : indexLibrary(shows.data, self),
      simkl: simkl.data == null ? null : indexSimklLibrary(simkl.data),
      anilist: anilist.data == null ? null : indexLibrary(anilist.data, entryItem),
      serializd: serializd.data == null ? null : indexLibrary(serializd.data, entryItem),
    },
  };
}

export type ProgressLibraries = ReturnType<typeof useProgressLibraries>;

/** One selector for poster eyes, numeric progress and whole-list counts; caches are provider-owned. */
export function useMediaProgress(items: readonly NormalizedMediaItem[]) {
  return useItemProgress(items, useProgressLibraries(items));
}

/** Per-item reads (film identity, Letterboxd viewing) matched against shared libraries. */
export function useItemProgress(items: readonly NormalizedMediaItem[], libraries: ProgressLibraries) {
  const { connected, letterboxdUsername, serializdUsername } = libraries;
  const { movies, shows, simkl, anilist, serializd } = libraries.indexes;
  const metadata = useMediaMetadata(items, connected.length > 0);
  const resolved = metadata.items;
  const matched = useQueries({
    queries: resolved.map((item) => letterboxdFilmWatchQuery(letterboxdUsername, item)),
    // TanStack structurally shares what `combine` returns: a watch that
    // settles without changing progress re-renders nothing, and unchanged
    // rows keep their objects, so a list redraws only the cells that moved.
    combine: (watches) => {
      const progress = resolved.map((item, index) => {
        const sources: MediaProgress[] = [];
        const add = (current: number, total: number | undefined, completed = false) => sources.push({ watched: current > 0 || completed, current, total, completed, unit: item.progressUnit });
        const trakt = filmLike(item) ? movies : shows;
        if (connected.includes(Provider.Trakt) && trakt != null) {
          const match = findProgressRow(trakt, item);
          if (match != null) add(match.currentProgress, match.totalEpisodes);
        }
        if (connected.includes(Provider.Simkl) && simkl != null) {
          const entry = findLibraryEntry(simkl, item);
          if (entry != null) add(findLibraryProgress(simkl, item) ?? 0, item.type === 'TV' && entry.item.type === 'ANIME' ? undefined : entry.item.totalEpisodes,
            filmLike(item) ? entry.status === 'completed' : item.type !== 'TV' && entry.status === 'completed');
        }
        if (connected.includes(Provider.AniList) && anilist != null) {
          const entry = findAniListProgress(item, anilist);
          if (entry != null) add(entry.item.currentProgress, item.type === 'TV' ? undefined : entry.item.totalEpisodes, item.type !== 'TV' && (entry.status === 'COMPLETED' || entry.status === 'REPEATING'));
        }
        if (letterboxdUsername != null && watches[index].data != null) add(1, 1, true);
        if (serializdUsername != null && item.type === 'TV' && serializd != null) {
          const show = findProgressRow(serializd, item);
          if (show != null) sources.push({ watched: true, completed: false, current: show.watchedSeasons, total: show.totalSeasons, unit: 'season' });
        }
        return mergeMediaProgress(item, sources);
      });
      const enabled = watches.filter((query) => query.isEnabled);
      return {
        items: resolved,
        progress,
        // A member-film 404 can be an undated watch, not evidence of non-membership.
        incomplete: watches.some((query, index) => query.isEnabled && query.isSuccess && query.data == null && !progress[index].completed),
        loading: enabled.some((query) => query.isPending || query.isFetching),
        failed: enabled.some((query) => query.isError),
        refetches: enabled.map((query) => query.refetch),
      };
    },
  });
  const queries = Object.values(libraries.queries).filter((query) => query.isEnabled);
  return {
    items: matched.items,
    progress: matched.progress,
    connected: connected.length > 0,
    loading: metadata.loading || matched.loading || queries.some((query) => query.isPending || query.isFetching),
    failed: metadata.failed || matched.failed || queries.some((query) => query.isError),
    incomplete: matched.incomplete,
    retry: () => Promise.all([...metadata.refetches, ...matched.refetches, ...queries.map((query) => query.refetch)].map((refetch) => refetch())),
  };
}
