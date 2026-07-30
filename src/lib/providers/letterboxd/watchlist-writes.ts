import { Effect } from 'effect';

import type { ProviderWriteResult } from '@/features/log-media/fan-out';
import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { LetterboxdDeps, LetterboxdWebResponse } from './deps';
import { filmPathFor, resolveFilmLid } from './writes';

const provider = 'letterboxd' as const;

/**
 * Reads the `PATCH /api/v0/me/watchlist/{lid}` outcome. Success is a 204 with
 * an empty body — the state after the call is the state that was sent, not
 * "whatever the opposite of before was" (the capture's classification,
 * docs/solutions/letterboxd-watchlist-write.md). `status: 0` bodies are the
 * injected script's own failure markers: `no-csrf` means the metadata call
 * came back without a token, which only happens signed-out, so it maps to the
 * same reconnect move as a 401/403.
 */
function interpretWatchlistResponse(
  response: LetterboxdWebResponse,
): Effect.Effect<void, ProviderError> {
  return Effect.gen(function* () {
    if (response.status === 401 || response.status === 403) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }
    if (response.status === 0) {
      if (response.body === 'no-csrf') {
        return yield* new ProviderAuthError({ provider, refreshFailed: true });
      }
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Letterboxd watchlist script failed: ${response.body}`),
      });
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* new ProviderDecodeError({
        provider,
        detail: `Letterboxd responded ${response.status} setting the watchlist state`,
      });
    }
  });
}

/**
 * The Letterboxd watchlist adapter both verbs share (plan 0033 R3): a
 * **declarative state set**, `{"inWatchlist": true|false}`, never a toggle —
 * so a repeat add is idempotent and plan 0031 KTD-6's hazard (a wrong guess
 * *removing* a film while reporting success) does not exist on this endpoint.
 * Native only, riding the same captured-WebView-session plumbing as the diary
 * write (`deps.watchlistWebFetch`): the film's LID resolves over public
 * nitro-fetch as a fallback (the injected script reads it off the page meta
 * too), then the CSRF fetch + PATCH run *inside* the authenticated login
 * WebView. No captured session or no transport (web, disconnected) fails as a
 * dead session so the caller surfaces "reconnect Letterboxd" rather than
 * silently dropping the write.
 */
export function setLetterboxdWatchlist(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
  inWatchlist: boolean,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  const session = deps.session;
  const watchlistWebFetch = deps.watchlistWebFetch;
  if (session == null || session.cookie === '' || watchlistWebFetch == null) {
    return Effect.fail(new ProviderAuthError({ provider, refreshFailed: true }));
  }

  const isMovie =
    item.type === 'MOVIE' || (item.type === 'ANIME' && item.isFilm === true);
  if (!isMovie) {
    return Effect.fail(
      new ProviderDecodeError({
        provider,
        detail: `media type ${item.type} does not route to Letterboxd (routing.ts should have filtered it)`,
      }),
    );
  }

  const filmPath = filmPathFor(item);
  if (filmPath == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider,
        detail: `"${item.title}" has no Letterboxd slug or tmdb id to resolve a film id`,
      }),
    );
  }

  return resolveFilmLid(deps, item).pipe(
    Effect.flatMap((filmLid) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => watchlistWebFetch({ filmPath, filmLid, inWatchlist }),
          catch: (cause) => new ProviderNetworkError({ provider, cause }),
        });
        yield* interpretWatchlistResponse(response);
        return { status: 'ok' } as const;
      }),
    ),
  );
}

/** The add verb — `useWatchlistMedia`'s fan-out target. */
export function addToLetterboxdWatchlist(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return setLetterboxdWatchlist(deps, item, true);
}

/** The remove verb — `useUnwatchlistMedia`'s fan-out target. Removing an
 * already-absent film is a 204 no-op, which is what makes the remove safe even
 * when the paginated scrape read only part of the list. */
export function removeFromLetterboxdWatchlist(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
): Effect.Effect<ProviderWriteResult, ProviderError> {
  return setLetterboxdWatchlist(deps, item, false);
}
