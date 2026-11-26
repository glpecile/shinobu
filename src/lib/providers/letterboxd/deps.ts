import type { HttpFetch } from '@/lib/http/types';

/**
 * Signed-in web session harvested from the login WebView's cookie jar; username
 * comes from `letterboxd.signed.in.as` (docs/solutions/letterboxd-no-api-fallback.md).
 */
export interface LetterboxdSession {
  cookie: string;
  /** Mirrors `com.xk72.webparts.csrf`; echoed as the `__csrf` body param. */
  csrf: string;
  /**
   * Letterboxd binds the session to the login WebView's `User-Agent`; writes
   * must replay it verbatim or the origin treats them as signed-out
   * (docs/solutions/letterboxd-no-api-fallback.md).
   */
  userAgent?: string;
}

export interface LetterboxdDeps {
  fetch: HttpFetch;
  username: string | null;
  session?: LetterboxdSession | null;
  /**
   * Native same-origin WebView write transport: replaying captured cookies over
   * nitro-fetch is rejected as signed-out by Letterboxd
   * (docs/solutions/letterboxd-no-api-fallback.md).
   */
  webFetch?: LetterboxdWebFetch;
  userscriptFetch?: LetterboxdWebFetch;
  userscriptWatchlistFetch?: LetterboxdWatchlistWebFetch;
  watchlistWebFetch?: LetterboxdWatchlistWebFetch;
  listMembershipFetch?: LetterboxdListMembershipFetch;
  listCreateFetch?: LetterboxdListCreateFetch;
  listRenameFetch?: LetterboxdListRenameFetch;
  listLikeWebFetch?: LetterboxdListLikeWebFetch;
  userscriptListLikeFetch?: LetterboxdListLikeWebFetch;
}

/**
 * Diary write via `POST /api/v0/production-log-entries` (the legacy
 * `/s/save-diary-entry` form endpoint 404s; docs/solutions/letterboxd-no-api-fallback.md).
 * Requires loading `filmPath` first for `window.supermodelCSRF` and the
 * `production:identifier` meta (film LID).
 */
export interface LetterboxdWebRequest {
  filmPath: string;
  /** `letterboxd.com`-local YYYY-MM-DD diary date. */
  viewingDateStr: string;
  tags: string[];
  rewatch: boolean;
  liked?: boolean;
}

export interface LetterboxdWebResponse {
  status: number;
  body: string;
}

export type LetterboxdWebFetch = (request: LetterboxdWebRequest) => Promise<LetterboxdWebResponse>;

/**
 * Watchlist write via `PATCH /api/v0/me/watchlist/{lid}` with a fresh CSRF
 * token from `POST /ajax/letterboxd-metadata/` (docs/solutions/letterboxd-watchlist-write.md).
 * Declarative state set, not a toggle (idempotent).
 */
export interface LetterboxdWatchlistWebRequest {
  filmPath: string;
  inWatchlist: boolean;
}

export type LetterboxdWatchlistWebFetch = (
  request: LetterboxdWatchlistWebRequest,
) => Promise<LetterboxdWebResponse>;

export interface LetterboxdListLikeWebRequest {
  listPath: string;
  username: string;
  liked: boolean;
}

export type LetterboxdListLikeWebFetch = (
  request: LetterboxdListLikeWebRequest,
) => Promise<LetterboxdWebResponse>;

export interface LetterboxdListMembershipRequest {
  listPath: string;
  username: string;
  filmPath: string;
  present: boolean;
}

export type LetterboxdListMembershipFetch = (
  request: LetterboxdListMembershipRequest,
) => Promise<LetterboxdWebResponse>;

export type LetterboxdListSharing = 'Public' | 'Anyone' | 'Friends' | 'You';

export interface LetterboxdListCreateRequest {
  username: string;
  name: string;
  description: string;
  tags: string[];
  sharing: LetterboxdListSharing;
  ranked: boolean;
  filmPaths: string[];
}

export type LetterboxdListCreateFetch = (
  request: LetterboxdListCreateRequest,
) => Promise<LetterboxdWebResponse>;

export interface LetterboxdListRenameRequest {
  listPath: string;
  username: string;
  name: string;
}

export type LetterboxdListRenameFetch = (
  request: LetterboxdListRenameRequest,
) => Promise<LetterboxdWebResponse>;
