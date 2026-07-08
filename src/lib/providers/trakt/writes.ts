import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { traktAuthedRequest } from './api';
import type { TraktDeps } from './deps';
import type { TraktIds } from './normalize';

export interface TraktLogOptions {
  /** ISO instant; omitted = Trakt records "now". */
  watchedAt?: string;
  /** Required when logging a TV item. */
  episode?: { season: number; number: number };
}

interface TraktSyncHistoryResponse {
  added: { movies: number; episodes: number };
  not_found: { movies: unknown[]; shows: unknown[]; episodes: unknown[] };
}

function idsFor(item: NormalizedMediaItem): TraktIds | null {
  const { trakt, tmdb } = item.externalIds;
  if (trakt == null && tmdb == null) return null;
  return {
    ...(trakt != null ? { trakt } : {}),
    ...(tmdb != null ? { tmdb } : {}),
  };
}

/**
 * The Trakt write adapter `useLogMedia` (todos/005) fans out to. Movies (and
 * anime films — MOVIE to Trakt, per routing.ts) post as movie history;
 * TV posts one watched episode. Zero-added responses fail loudly instead of
 * pretending the log landed.
 */
export function logToTrakt(
  deps: TraktDeps,
  item: NormalizedMediaItem,
  options: TraktLogOptions = {},
): Effect.Effect<void, ProviderError> {
  const ids = idsFor(item);
  if (ids == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'trakt',
        detail: `"${item.title}" has no trakt/tmdb id to log against`,
      }),
    );
  }

  const isMovie = item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  let body: unknown;

  if (isMovie) {
    body = {
      movies: [{ ids, ...(options.watchedAt ? { watched_at: options.watchedAt } : {}) }],
    };
  } else if (item.type === 'TV') {
    if (options.episode == null) {
      return Effect.fail(
        new ProviderDecodeError({
          provider: 'trakt',
          detail: `logging TV "${item.title}" requires an episode (season/number)`,
        }),
      );
    }
    body = {
      shows: [
        {
          ids,
          seasons: [
            {
              number: options.episode.season,
              episodes: [
                {
                  number: options.episode.number,
                  ...(options.watchedAt ? { watched_at: options.watchedAt } : {}),
                },
              ],
            },
          ],
        },
      ],
    };
  } else {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'trakt',
        detail: `media type ${item.type} does not route to Trakt (routing.ts should have filtered it)`,
      }),
    );
  }

  return traktAuthedRequest<TraktSyncHistoryResponse>(deps, '/sync/history', {
    method: 'POST',
    body,
  }).pipe(
    Effect.filterOrFail(
      (result) => result.added.movies + result.added.episodes > 0,
      () =>
        new ProviderDecodeError({
          provider: 'trakt',
          detail: `Trakt matched no items for "${item.title}" (not_found)`,
        }),
    ),
    Effect.asVoid,
  );
}
