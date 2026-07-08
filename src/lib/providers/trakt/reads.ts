import { Clock, Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderError } from '@/lib/providers/errors';
import { traktAuthedRequest, traktRequest } from './api';
import type { TraktDeps } from './deps';
import {
  normalizeTrendingMovie,
  normalizeTrendingShow,
  normalizeWatchedShow,
  type TraktTrendingMovie,
  type TraktTrendingShow,
  type TraktWatchedShow,
} from './normalize';

/**
 * Public catalogue read — needs only the client id, no OAuth, so the app has
 * something real to show before any provider is connected (plan 0006 §8).
 */
export function getTrendingMovies(
  deps: TraktDeps,
  options: { limit?: number } = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = options.limit ?? 30;
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktTrendingMovie[]>(
      deps,
      `/movies/trending?extended=full,images&limit=${limit}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw.map((entry) => normalizeTrendingMovie(entry, nowIso));
  });
}

export function getTrendingShows(
  deps: TraktDeps,
  options: { limit?: number } = {},
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  const limit = options.limit ?? 30;
  return Effect.gen(function* () {
    const raw = yield* traktRequest<TraktTrendingShow[]>(
      deps,
      `/shows/trending?extended=full,images&limit=${limit}`,
    );
    const now = yield* Clock.currentTimeMillis;
    const nowIso = new Date(now).toISOString();
    return raw.map((entry) => normalizeTrendingShow(entry, nowIso));
  });
}

export function getWatchedShows(
  deps: TraktDeps,
): Effect.Effect<NormalizedMediaItem[], ProviderError> {
  return traktAuthedRequest<TraktWatchedShow[]>(
    deps,
    '/sync/watched/shows?extended=full,images',
  ).pipe(Effect.map((shows) => shows.map(normalizeWatchedShow)));
}
