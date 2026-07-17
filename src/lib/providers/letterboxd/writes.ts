import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import { LETTERBOXD_BASE_URL, LETTERBOXD_SAVE_DIARY_PATH } from './config';
import type { LetterboxdDeps, LetterboxdSession } from './deps';

const provider = 'letterboxd' as const;

export interface LetterboxdLogOptions {
  /** ISO instant; the diary date is its *local* calendar day. Omitted = today. */
  watchedAt?: string;
  /** Diary tags (the app's Letterboxd-only log field, plan 0012). */
  tags?: string[];
  /** Parity rewatch, set by the fan-out's reconcile step (plan 0011). */
  rewatch?: boolean;
}

/** `letterboxd.com`-local YYYY-MM-DD for the diary date — the user's calendar day. */
function localDateStr(iso?: string): string {
  const date = iso != null ? new Date(iso) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The film's numeric id, read from the production uid the diary form keys on.
 * Verified against a live film page (docs/solutions/letterboxd-no-api-fallback.md):
 * pages carry NO `data-film-id` — the id lives in `data-production-uid="film:N"`
 * (and the `production:identifier` meta), so match that first and fall back to a
 * bare `film:N` before giving up.
 */
function parseFilmId(html: string): number | null {
  const match =
    /data-production-uid="film:(\d+)"/.exec(html) ??
    /"uid":"film:(\d+)"/.exec(html) ??
    /data-film-id="(\d+)"/.exec(html) ??
    /film:(\d+)/.exec(html);
  return match == null ? null : Number(match[1]);
}

/**
 * `save-diary-entry` keys on Letterboxd's numeric film id, but a movie routed
 * here can come from anywhere — a watchlist slug, or a Trakt/TMDB-sourced movie
 * with no Letterboxd identity at all. Resolve it from a full film page (which,
 * unlike the `/json/` AJAX endpoints, isn't Cloudflare-walled): the slug page
 * directly, or Letterboxd's external-id redirect `/tmdb/{id}/` → `/film/{slug}/`.
 */
function resolveFilmId(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
): Effect.Effect<number, ProviderError> {
  const slug = item.externalIds.letterboxd;
  const tmdb = item.externalIds.tmdb;
  const path =
    slug != null && slug !== ''
      ? `/film/${slug}/`
      : tmdb != null
        ? `/tmdb/${tmdb}/`
        : null;

  if (path == null) {
    return Effect.fail(
      new ProviderDecodeError({
        provider,
        detail: `"${item.title}" has no Letterboxd slug or tmdb id to resolve a film id`,
      }),
    );
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => deps.fetch(`${LETTERBOXD_BASE_URL}${path}`),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 404) {
      return yield* new ProviderDecodeError({
        provider,
        detail: `Letterboxd has no film at ${path}`,
      });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Letterboxd responded ${response.status} for ${path}`),
      });
    }

    const html = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({ provider, detail: `unreadable film page ${path}` }),
    });

    const filmId = parseFilmId(html);
    if (filmId == null) {
      return yield* new ProviderDecodeError({
        provider,
        detail: `no film id found on ${path}`,
      });
    }
    return filmId;
  });
}

/**
 * The `save-diary-entry` form body, mirrored from the live `<form>` on a film
 * page (docs/solutions/letterboxd-no-api-fallback.md). Two things the old
 * reverse-engineered guess got wrong and caused a 404 / silent tag loss:
 *  - the film is identified by `viewingableUid` = `film:{id}` — there is NO
 *    `filmId` field; sending `filmId` alone is why the write 404'd;
 *  - tags are one comma-separated `tags` text field, not repeatable `tag` params.
 * Checkboxes (`rewatch`, `liked`, `specifiedDate`) submit by *presence*, so a
 * false one must be omitted, never sent as `=false` (that reads as checked).
 */
function diaryBody(
  filmId: number,
  session: LetterboxdSession,
  options: LetterboxdLogOptions,
): string {
  const params = new URLSearchParams();
  params.set('__csrf', session.csrf);
  params.set('viewingId', ''); // empty = create a new entry (not edit)
  params.set('viewingableUid', `film:${filmId}`);
  params.set('specifiedDate', 'true'); // we always send an explicit date
  params.set('viewingDateStr', localDateStr(options.watchedAt));
  params.set('review', '');
  params.set('rating', '0'); // 0 = unrated
  if (options.rewatch === true) params.set('rewatch', 'true');
  const tags = (options.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag !== '');
  if (tags.length > 0) params.set('tags', tags.join(', '));
  return params.toString();
}

/**
 * Reads the `save-diary-entry` outcome. The endpoint returns JSON
 * (`{ result, messages, csrf }`); a logged-out/expired session serves HTML
 * instead, which we treat as a dead session ("reconnect Letterboxd") rather
 * than a silent success.
 */
function interpretDiaryResponse(
  response: Response,
  item: NormalizedMediaItem,
): Effect.Effect<void, ProviderError> {
  return Effect.gen(function* () {
    // 403 here is a CSRF/session rejection, not a Cloudflare wall — same
    // reconnect move as 401.
    if (response.status === 401 || response.status === 403) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }
    if (!response.ok) {
      return yield* new ProviderNetworkError({
        provider,
        cause: new Error(`Letterboxd responded ${response.status} saving diary entry`),
      });
    }

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new ProviderDecodeError({
          provider,
          detail: 'unreadable save-diary-entry response',
        }),
    });

    let parsed: { result?: boolean; messages?: string[] } | null;
    try {
      parsed = JSON.parse(text) as { result?: boolean; messages?: string[] };
    } catch {
      parsed = null;
    }

    // Non-JSON body = the session isn't logged in (Letterboxd served a page).
    if (parsed == null) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (parsed.result === false) {
      return yield* new ProviderDecodeError({
        provider,
        detail:
          parsed.messages != null && parsed.messages.length > 0
            ? parsed.messages.join('; ')
            : `Letterboxd rejected the diary entry for "${item.title}"`,
      });
    }
  });
}

/**
 * The Letterboxd write adapter `useLogMedia` fans out to (plan 0012,
 * session-capture path): resolve the film's numeric id, then POST a diary
 * entry as the signed-in web user (captured cookie + `__csrf`). Movies and
 * anime films only — routing.ts guarantees nothing else reaches here. A missing
 * session fails as a dead session so the caller surfaces "reconnect Letterboxd"
 * instead of posting anonymously.
 */
export function logToLetterboxd(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
  options: LetterboxdLogOptions = {},
): Effect.Effect<void, ProviderError> {
  const session = deps.session;
  if (session == null || session.cookie === '' || session.csrf === '') {
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

  return resolveFilmId(deps, item).pipe(
    Effect.flatMap((filmId) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            deps.fetch(`${LETTERBOXD_BASE_URL}${LETTERBOXD_SAVE_DIARY_PATH}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: `${LETTERBOXD_BASE_URL}/`,
                Cookie: session.cookie,
              },
              body: diaryBody(filmId, session, options),
            }),
          catch: (cause) => new ProviderNetworkError({ provider, cause }),
        });
        yield* interpretDiaryResponse(response, item);
      }),
    ),
  );
}
