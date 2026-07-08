import type { NormalizedMediaItem } from '@/types/media';

/** Raw Trakt payload shapes — these never escape lib/providers (AGENTS.md Data Contract). */

export interface TraktIds {
  trakt?: number;
  slug?: string;
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
}

/** From `?extended=images`: arrays of CDN paths, scheme-less (e.g. "walter.trakt.tv/..."). */
export interface TraktImages {
  poster?: string[];
  fanart?: string[];
}

export interface TraktMovie {
  title: string;
  year?: number;
  ids: TraktIds;
  images?: TraktImages;
}

export interface TraktShow {
  title: string;
  year?: number;
  ids: TraktIds;
  aired_episodes?: number;
  images?: TraktImages;
}

export interface TraktTrendingMovie {
  watchers: number;
  movie: TraktMovie;
}

export interface TraktTrendingShow {
  watchers: number;
  show: TraktShow;
}

export interface TraktWatchedShow {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  show: TraktShow;
  seasons?: {
    number: number;
    episodes: { number: number; last_watched_at: string }[];
  }[];
}

function posterUrl(images: TraktImages | undefined): string {
  const poster = images?.poster?.[0];
  if (poster == null) return '';
  return poster.startsWith('http') ? poster : `https://${poster}`;
}

/**
 * `nowIso` keeps this pure: trending entries carry no timestamp of their own,
 * and the read effect supplies the instant from Effect's Clock.
 */
export function normalizeTrendingMovie(
  raw: TraktTrendingMovie,
  nowIso: string,
): NormalizedMediaItem {
  return {
    id: `trakt-${raw.movie.ids.trakt}`,
    title: raw.movie.title,
    coverImage: posterUrl(raw.movie.images),
    type: 'MOVIE',
    currentProgress: 0,
    progressUnit: 'episode',
    lastUpdated: nowIso,
    externalIds: {
      ...(raw.movie.ids.trakt != null ? { trakt: raw.movie.ids.trakt } : {}),
      ...(raw.movie.ids.tmdb != null ? { tmdb: raw.movie.ids.tmdb } : {}),
    },
  };
}

export function normalizeTrendingShow(
  raw: TraktTrendingShow,
  nowIso: string,
): NormalizedMediaItem {
  return {
    id: `trakt-${raw.show.ids.trakt}`,
    title: raw.show.title,
    coverImage: posterUrl(raw.show.images),
    type: 'TV',
    currentProgress: 0,
    progressUnit: 'episode',
    ...(raw.show.aired_episodes != null
      ? { totalEpisodes: raw.show.aired_episodes }
      : {}),
    lastUpdated: nowIso,
    externalIds: {
      ...(raw.show.ids.trakt != null ? { trakt: raw.show.ids.trakt } : {}),
      ...(raw.show.ids.tmdb != null ? { tmdb: raw.show.ids.tmdb } : {}),
    },
  };
}

export function normalizeWatchedShow(raw: TraktWatchedShow): NormalizedMediaItem {
  const watchedEpisodes =
    raw.seasons?.reduce((count, season) => count + season.episodes.length, 0) ?? 0;

  return {
    id: `trakt-${raw.show.ids.trakt}`,
    title: raw.show.title,
    coverImage: posterUrl(raw.show.images),
    type: 'TV',
    currentProgress: watchedEpisodes,
    progressUnit: 'episode',
    ...(raw.show.aired_episodes != null
      ? { totalEpisodes: raw.show.aired_episodes }
      : {}),
    lastUpdated: raw.last_watched_at,
    externalIds: {
      ...(raw.show.ids.trakt != null ? { trakt: raw.show.ids.trakt } : {}),
      ...(raw.show.ids.tmdb != null ? { tmdb: raw.show.ids.tmdb } : {}),
    },
  };
}
