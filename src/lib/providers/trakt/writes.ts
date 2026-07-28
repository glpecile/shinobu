import { Effect } from 'effect';

import type { NormalizedMediaItem } from '@/types/media';
import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import { ProviderDecodeError, type ProviderError } from '@/lib/providers/errors';
import { traktAuthedRequest } from './api';
import type { TraktDeps } from './deps';
import type { TraktIds } from './normalize';

export interface TraktLogOptions {
  /** ISO instant; omitted = Trakt records "now". */
  watchedAt?: string;
  /** A single TV episode watch. Mutually exclusive with `episodes`. */
  episode?: { season: number; number: number };
  /**
   * One or more TV episode watches for the same show (a whole-season batch is
   * one `/sync/history` POST). Mutually exclusive with `episode`.
   */
  episodes?: Array<{ season: number; number: number }>;
}

/**
 * `/sync/watchlist` reports per-category counts for what it *added* and what
 * was *already there*, plus the ids it could not match. That `existing` count
 * is the idempotency signal plan 0031 R16 requires: a re-add is reported from
 * the write response itself, never from a membership read issued beforehand.
 */
interface TraktWatchlistCounts {
  movies: number;
  shows: number;
  /** Sent only for season/episode-level adds, which this adapter never makes. */
  seasons?: number;
  episodes?: number;
}

interface TraktSyncWatchlistResponse {
  added: TraktWatchlistCounts;
  existing: TraktWatchlistCounts;
  not_found: { movies: unknown[]; shows: unknown[]; seasons?: unknown[]; episodes?: unknown[] };
}

interface TraktSyncHistoryResponse {
  added: { movies: number; episodes: number };
  not_found: { movies: unknown[]; shows: unknown[]; episodes: unknown[] };
}

function idsFor(item: NormalizedMediaItem): TraktIds | null {
  // /sync/history matches on any of these; tvdb/imdb are what ani.zip-mapped
  // anime carry when Trakt's own id isn't known yet (plan 0011 decision 5).
  const { trakt, tmdb, tvdb, imdb } = item.externalIds;
  if (trakt == null && tmdb == null && tvdb == null && imdb == null) return null;
  return {
    ...(trakt != null ? { trakt } : {}),
    ...(tmdb != null ? { tmdb } : {}),
    ...(tvdb != null ? { tvdb } : {}),
    ...(imdb != null ? { imdb } : {}),
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
        detail: `"${item.title}" has no trakt/tmdb/tvdb/imdb id to log against`,
      }),
    );
  }

  const isMovie = item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  let body: unknown;

  if (isMovie) {
    body = {
      movies: [{ ids, ...(options.watchedAt ? { watched_at: options.watchedAt } : {}) }],
    };
  } else if (item.type === 'TV' || item.type === 'ANIME') {
    // Unify single vs batch: a single `episode` is a one-element batch.
    const batch =
      options.episodes ??
      (options.episode != null ? [options.episode] : null);
    if (batch == null || batch.length === 0) {
      return Effect.fail(
        new ProviderDecodeError({
          provider: 'trakt',
          detail: `logging TV "${item.title}" requires an episode (season/number)`,
        }),
      );
    }
    // Group by season so a whole-season log is one request, not N — Trakt's
    // /sync/history body is seasons[].episodes[].
    const bySeason = new Map<number, number[]>();
    for (const { season, number } of batch) {
      const bucket = bySeason.get(season) ?? [];
      bucket.push(number);
      bySeason.set(season, bucket);
    }
    body = {
      shows: [
        {
          ids,
          seasons: [...bySeason.entries()].map(([season, numbers]) => ({
            number: season,
            episodes: numbers.map((number) => ({
              number,
              ...(options.watchedAt ? { watched_at: options.watchedAt } : {}),
            })),
          })),
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

/**
 * The Trakt watchlist-add adapter (plan 0031 U3). Same id resolution and same
 * movie-vs-show shape as `logToTrakt` — an anime film is a MOVIE to Trakt, per
 * routing.ts — but a much smaller payload: `/sync/watchlist` takes ids and
 * nothing else (no `watched_at`, no seasons, no episodes; R3).
 *
 * Idempotency is read off the response (R16): `added` 0 with `existing` 1 means
 * the item was already on the watchlist, which is a *reasoned skip*, not a
 * failure — the user's intent is already recorded. `not_found` is the opposite
 * and fails naming the item, because nothing landed anywhere.
 *
 * Note the read half is different: `GET /sync/watchlist` must paginate
 * explicitly (`limit ≤ 250`, plan KTD-16). That constraint is the read's
 * (PR C), not this add's — but it is why nothing here should assume Trakt
 * hands back unbounded collections.
 */
export function addToTraktWatchlist(
  deps: TraktDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const ids = idsFor(item);
  if (ids == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'trakt',
        detail: `"${item.title}" has no trakt/tmdb/tvdb/imdb id to watchlist against`,
      }),
    );
  }

  const isMovie = item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  let body: unknown;

  if (isMovie) {
    body = { movies: [{ ids }] };
  } else if (item.type === 'TV' || item.type === 'ANIME') {
    body = { shows: [{ ids }] };
  } else {
    return Effect.fail(
      new ProviderDecodeError({
        provider: 'trakt',
        detail: `media type ${item.type} does not route to Trakt (routing.ts should have filtered it)`,
      }),
    );
  }

  return traktAuthedRequest<TraktSyncWatchlistResponse>(deps, '/sync/watchlist', {
    method: 'POST',
    body,
  }).pipe(
    Effect.flatMap((result): Effect.Effect<ProviderWriteResult, ProviderError> => {
      const notFound =
        result.not_found.movies.length + result.not_found.shows.length > 0;
      if (notFound) {
        return Effect.fail(
          new ProviderDecodeError({
            provider: 'trakt',
            detail: `Trakt matched no items for "${item.title}" (not_found)`,
          }),
        );
      }
      if (result.added.movies + result.added.shows > 0) {
        return Effect.succeed({ status: 'ok' } satisfies ProviderWriteResult);
      }
      if (result.existing.movies + result.existing.shows > 0) {
        return Effect.succeed({
          status: 'skipped',
          reason: 'already on your watchlist',
        } satisfies ProviderWriteResult);
      }
      // Nothing added, nothing pre-existing and nothing reported unmatched:
      // Trakt accepted the request but recorded no intent, so don't claim it did.
      return Effect.fail(
        new ProviderDecodeError({
          provider: 'trakt',
          detail: `Trakt added nothing for "${item.title}"`,
        }),
      );
    }),
  );
}
