import type { HttpFetch } from '@/lib/http/types';

/**
 * A captured signed-in web session — what writes ride on (plan 0012,
 * session-capture path). Harvested from the login WebView's cookie jar; the
 * username itself comes from the `letterboxd.signed.in.as` cookie
 * (docs/solutions/letterboxd-no-api-fallback.md).
 */
export interface LetterboxdSession {
  /** The full `Cookie:` header value for letterboxd.com (session + CSRF). */
  cookie: string;
  /** Mirrors `com.xk72.webparts.csrf`; echoed as the `__csrf` body param. */
  csrf: string;
  /**
   * The `User-Agent` the login WebView ran under. Letterboxd binds the session
   * to it, so every write must replay it verbatim or the origin treats the
   * request as signed-out (plan 0012, docs/solutions/letterboxd-no-api-fallback.md).
   */
  userAgent?: string;
}

/**
 * Every Letterboxd effect takes this as its first argument — same
 * deps-injection-without-Layers pattern as TraktDeps/AniListDeps (plan 0006
 * decision 4). Reads only need the public `username`; writes additionally
 * need a captured `session` (absent = read-only connection, the write fails
 * with a dead-session auth error rather than posting anonymously).
 */
export interface LetterboxdDeps {
  fetch: HttpFetch;
  /** The connected public username, or null while disconnected. */
  username: string | null;
  /** Present once a web login was captured; required for writes only. */
  session?: LetterboxdSession | null;
  /**
   * Same-origin write transport that runs *inside* the authenticated login
   * WebView (native only). Replaying the captured cookies over nitro-fetch does
   * NOT reconstitute the login — Letterboxd's origin still treats those requests
   * as signed-out (proven empirically, plan 0012 /
   * docs/solutions/letterboxd-no-api-fallback.md). The only channel that carries
   * the real session is the WebView itself, so writes go through here. Absent on
   * web (read-only) and in tests that don't exercise the write path.
   */
  webFetch?: LetterboxdWebFetch;
  /**
   * Same-origin *watchlist* transport, running in the same authenticated
   * WebView as `webFetch` (plan 0033 KTD-4). A separate field rather than a
   * generalized one because each transport's injected script implements one
   * documented endpoint — never a generic "run any script" surface.
   */
  watchlistWebFetch?: LetterboxdWatchlistWebFetch;
}

/**
 * A diary write executed inside the authenticated Letterboxd WebView. The bridge
 * navigates the WebView to `filmPath` first — the film page carries the live
 * `window.supermodelCSRF` token and the `production:identifier` meta (the film
 * LID) the write needs. It then POSTs Letterboxd's modern same-origin JSON API
 * `/api/v0/production-log-entries` (the legacy `/s/save-diary-entry` form endpoint
 * is dead and 404s — docs/solutions/letterboxd-no-api-fallback.md).
 */
export interface LetterboxdWebRequest {
  /** Film page to render so the CSRF token + LID meta are in the session, e.g. `/film/tuner/`. */
  filmPath: string;
  /**
   * The film's Letterboxd **LID** (`productionId` for the API, e.g. `UH8e`) —
   * NOT the `film:{numericId}` uid. A fallback if the page's `production:identifier`
   * meta can't be read inside the WebView; `''` when it couldn't be resolved.
   */
  filmLid: string;
  /** `letterboxd.com`-local YYYY-MM-DD diary date. */
  viewingDateStr: string;
  /** Diary tags (the API takes a JSON string array), possibly empty. */
  tags: string[];
  /** Whether to mark the entry a rewatch. */
  rewatch: boolean;
}

/** The status + text body the WebView `fetch` observed, relayed back over the
 * `postMessage` bridge. */
export interface LetterboxdWebResponse {
  status: number;
  body: string;
}

export type LetterboxdWebFetch = (
  request: LetterboxdWebRequest,
) => Promise<LetterboxdWebResponse>;

/**
 * A watchlist state set executed inside the authenticated Letterboxd WebView
 * (plan 0033 R3, endpoint capture: docs/solutions/letterboxd-watchlist-write.md).
 * The bridge navigates to `filmPath` (the LID meta lives there), fetches a
 * fresh CSRF token from `POST /ajax/letterboxd-metadata/`, then PATCHes
 * `/api/v0/me/watchlist/{lid}` with `{"inWatchlist": true|false}` — a
 * declarative state set, not a toggle, so a repeat add is idempotent (KTD-5).
 */
export interface LetterboxdWatchlistWebRequest {
  /** Film page to render so the LID meta is in the session, e.g. `/film/tuner/`. */
  filmPath: string;
  /**
   * The film's Letterboxd **LID** (e.g. `294O`) — a fallback if the page's
   * `production:identifier` meta can't be read inside the WebView; `''` when
   * it couldn't be resolved.
   */
  filmLid: string;
  /** The target membership state — the body of the PATCH, verbatim. */
  inWatchlist: boolean;
}

export type LetterboxdWatchlistWebFetch = (
  request: LetterboxdWatchlistWebRequest,
) => Promise<LetterboxdWebResponse>;
