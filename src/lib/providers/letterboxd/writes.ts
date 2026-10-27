import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { NormalizedMediaItem } from '@/types/media';
import type { LetterboxdDeps, LetterboxdWebResponse } from './deps';

const provider = 'letterboxd' as const;

export interface LetterboxdLogOptions {
  /** ISO instant; the diary date is its *local* calendar day. Omitted = today. */
  watchedAt?: string;
  /** Diary tags (the app's Letterboxd-only log field, plan 0012). */
  tags?: string[];
  liked?: boolean;
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
 * The film page a write loads: its Letterboxd slug page, or the external-id
 * redirect `/tmdb/{id}/` → `/film/{slug}/` for a Trakt/TMDB movie with no
 * Letterboxd identity. `null` when neither id is present.
 */
export function filmPathFor(item: NormalizedMediaItem): string | null {
  const slug = item.externalIds.letterboxd;
  const tmdb = item.externalIds.tmdb;
  return slug != null && slug !== ''
    ? `/film/${slug}/`
    : tmdb != null
      ? `/tmdb/${tmdb}/`
      : null;
}

/**
 * The injected scripts' own `status: 0` failure markers (webview-bridge.ts),
 * or null when `response` carries a real HTTP status. A page without the
 * `production:identifier` meta is Letterboxd's "TMDB Import Result" page for an
 * id it has no film for (it answers 200, not 404). `no-csrf` only happens
 * signed-out. Anything else is the in-page fetch failing, which is not a dead session.
 */
export function scriptFailure(
  response: LetterboxdWebResponse,
  filmPath: string,
): ProviderError | null {
  if (response.status !== 0) return null;
  switch (response.body) {
    case 'no-production-lid':
      return new ProviderDecodeError({ provider, detail: `Letterboxd has no film at ${filmPath}` });
    case 'no-csrf':
      return new ProviderAuthError({ provider, refreshFailed: true });
    default:
      return new ProviderNetworkError({
        provider,
        cause: new Error(`Letterboxd write script failed: ${response.body}`),
      });
  }
}

/** Trimmed, non-empty diary tags (the app's Letterboxd-only log field). The
 * `/api/v0` write takes a JSON string array. */
function tagList(options: LetterboxdLogOptions): string[] {
  return (options.tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/** A `messages` entry in the `/api/v0` response — the site treats any
 * `type === 'Error'` as a failure even on a 2xx. */
interface ApiMessage {
  type?: string;
  title?: string;
  text?: string;
}

/** A useful human string out of an API message, whatever field it carries. */
function messageText(message: ApiMessage): string {
  return message.title ?? message.text ?? message.type ?? 'error';
}

/**
 * Reads the `/api/v0/production-log-entries` outcome. Success is `200
 * { logEntry, messages }`; a validation failure is `400 { message | messages }`;
 * `401`/`403` is an unauthenticated/expired session (or Cloudflare wall) we treat
 * as a dead session ("reconnect Letterboxd"). Even a 200 can carry a
 * `messages: [{ type: 'Error' }]`, which the site itself treats as a failure.
 * `status`/`body` come from the WebView `fetch` relayed over the postMessage
 * bridge, not a `Response` object.
 */
function interpretDiaryResponse(
  response: LetterboxdWebResponse,
  filmPath: string,
): Effect.Effect<void, ProviderError> {
  return Effect.gen(function* () {
    const failure = scriptFailure(response, filmPath);
    if (failure != null) return yield* failure;
    // 403 is either a CSRF/session rejection or a Cloudflare wall; either way the
    // in-session write failed to authenticate — same reconnect move as 401.
    if (response.status === 401 || response.status === 403) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }

    let parsed: { message?: string; messages?: ApiMessage[] } | null;
    try {
      parsed = JSON.parse(response.body) as {
        message?: string;
        messages?: ApiMessage[];
      };
    } catch {
      parsed = null;
    }

    // A 4xx with a documented error body — surface the message.
    if (response.status < 200 || response.status >= 300) {
      if (parsed != null) {
        const errors = (parsed.messages ?? []).filter((m) => m.type === 'Error');
        const detail =
          errors.length > 0
            ? errors.map(messageText).join('; ')
            : (parsed.message ??
              `Letterboxd responded ${response.status} saving the diary entry`);
        return yield* new ProviderDecodeError({ provider, detail });
      }
      // A non-JSON body on a non-2xx = the session isn't logged in (Letterboxd
      // served a page, not the API).
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }

    // Non-JSON body on a 2xx = the session isn't logged in (Letterboxd served a
    // page instead of the API response).
    if (parsed == null) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }
    // Even a 200 can carry error messages the site treats as a failure.
    const errors = (parsed.messages ?? []).filter((m) => m.type === 'Error');
    if (errors.length > 0) {
      return yield* new ProviderDecodeError({
        provider,
        detail: errors.map(messageText).join('; '),
      });
    }
  });
}

/**
 * The Letterboxd write adapter `useLogMedia` fans out to (plan 0012). Runs the
 * diary POST *inside the authenticated login WebView* (`deps.webFetch`), whose
 * injected script reads the film's LID off the page it loads. Replaying the
 * captured cookies over nitro-fetch lands as signed-out at the origin, so the
 * WebView is the only channel that carries the real session (docs/solutions/letterboxd-no-api-fallback.md).
 * Movies and anime films only; routing.ts guarantees nothing else reaches here.
 * No captured session (or no WebView transport, e.g. web) fails as a dead session
 * so the caller surfaces "reconnect Letterboxd" rather than silently dropping the
 * write. The web userscript transport uses the connected username instead of a
 * captured cookie session.
 */
export function logToLetterboxd(
  deps: LetterboxdDeps,
  item: NormalizedMediaItem,
  options: LetterboxdLogOptions = {},
): Effect.Effect<void, ProviderError> {
  const session = deps.session;
  const webFetch = deps.userscriptFetch ?? deps.webFetch;
  if (webFetch == null || (deps.userscriptFetch == null && (session == null || session.cookie === ''))) {
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

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        webFetch({
          filmPath,
          viewingDateStr: localDateStr(options.watchedAt),
          tags: tagList(options),
          liked: options.liked === true,
          rewatch: options.rewatch === true,
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });
    yield* interpretDiaryResponse(response, filmPath);
  });
}
