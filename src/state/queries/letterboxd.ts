import {
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Effect } from 'effect';

import {
  letterboxdReleaseInputs,
  type ResolveWatchlistFilm,
} from '@/features/up-next/letterboxd-releases';
import type { ReleaseUpNextInput } from '@/features/up-next/types';
import { httpFetch } from '@/lib/http/client';
import type { HttpFetch } from '@/lib/http/types';
import { mergeCatalogueMetadata } from '@/lib/providers/merge-metadata';
import { getMediaCatalogue } from '@/lib/providers/tmdb/reads';
import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/letterboxd/config';
import type { LetterboxdDeps } from '@/lib/providers/letterboxd/deps';
import { getUserTags, type LetterboxdTag } from '@/lib/providers/letterboxd/tags';
import { getLetterboxdWebFetch } from '@/lib/providers/letterboxd/webview-bridge';
import {
  checkUsernameExists,
  getWatchlist,
  getWatchlistPage,
  WATCHLIST_PAGE_SIZE,
} from '@/lib/providers/letterboxd/watchlist';
import {
  getLetterboxdSession,
  getLetterboxdUsername,
} from '@/state/session/letterboxd';
import { useConnectedProviders } from '@/state/session';
import { tmdbToken } from '@/state/session/tmdb-token';
import type { NormalizedMediaItem } from '@/types/media';

import { cachedTmdbMovieIdByTitle } from './mapping';
import { tmdbDeps, tmdbQueryKeys } from './tmdb';

/**
 * The web read transport (plan 0018): letterboxd.com sends no CORS headers, so
 * the browser can't call it directly — web reads hit the same-origin Worker
 * proxy (`/api/letterboxd/*`), which relays the two public GET shapes
 * server-side. The provider lib keeps building upstream URLs; the rewrite to
 * the proxy prefix lives entirely behind this injected fetch, so native
 * (nitro-fetch direct) and the lib code are untouched.
 */
const letterboxdWebProxyFetch: HttpFetch = (input, init) => {
  const url = String(input);
  if (!url.startsWith(LETTERBOXD_BASE_URL)) {
    // The lib only ever builds LETTERBOXD_BASE_URL URLs; anything else is a bug
    // at the call site, not something to relay.
    return Promise.reject(new Error(`unexpected Letterboxd URL: ${url}`));
  }
  return fetch(
    `${LETTERBOXD_WEB_PROXY_BASE_URL}${url.slice(LETTERBOXD_BASE_URL.length)}`,
    init,
  );
};

/**
 * Real dependency wiring for Letterboxd effects — same state → lib/providers
 * arrow as `traktDeps()`: the username (reads) and the captured web session
 * (writes) live here in state, injected into the provider lib. `webFetch` is
 * the authenticated-WebView write transport (native only; `undefined` on web
 * or when no WebView is mounted), since replayed cookies don't authenticate at
 * Letterboxd's origin (plan 0012).
 */
export function letterboxdDeps(): LetterboxdDeps {
  return {
    fetch:
      process.env.EXPO_OS === 'web' ? letterboxdWebProxyFetch : httpFetch,
    username: getLetterboxdUsername(),
    session: getLetterboxdSession(),
    webFetch: getLetterboxdWebFetch(),
  };
}

/**
 * Connect-time username validation at the Effect boundary. Native hits the RSS
 * URL directly; web goes through the same-origin proxy (plan 0018) — before it,
 * web saved unvalidated because the fetch itself was CORS-blocked.
 */
export function validateLetterboxdUsername(username: string): Promise<boolean> {
  const fetch =
    process.env.EXPO_OS === 'web' ? letterboxdWebProxyFetch : httpFetch;
  return Effect.runPromise(checkUsernameExists({ fetch }, username));
}

export const letterboxdQueryKeys = {
  all: ['letterboxd'] as const,
  watchlist: (username: string) =>
    [...letterboxdQueryKeys.all, 'watchlist', username] as const,
  /** The paginated "View all" grid — a separate entry from the feed row's
   *  single-page key so refetching one never discards the other's pages. */
  watchlistPages: (username: string) =>
    [...letterboxdQueryKeys.all, 'watchlist-pages', username] as const,
  /**
   * The user's public diary (RSS window) — the Letterboxd diary source
   * (plan 0016). Keyed by username so reconnecting as a different account
   * never serves the prior account's entries. On web it reads through the
   * Worker proxy (plan 0018); native reads letterboxd.com directly.
   */
  diary: (username: string) =>
    [...letterboxdQueryKeys.all, 'diary', username] as const,
  /**
   * The member's public tag vocabulary (`/{user}/tags/`) — the log sheet's tag
   * suggestions. Keyed by username so reconnecting as a different account never
   * suggests the prior account's tags.
   */
  tags: (username: string) => [...letterboxdQueryKeys.all, 'tags', username] as const,
};

/**
 * A tag vocabulary changes on the order of weeks, and this query fires every
 * time a log sheet opens — so it is cached hard, and kept in the cache well
 * past the sheet's lifetime (the default 5-minute gcTime would evict it
 * between two logs and refetch a 69 KB page for nothing).
 */
const TAGS_STALE_MS = 6 * 60 * 60_000;
const TAGS_GC_MS = 24 * 60 * 60_000;

/**
 * The user's public watchlist (first page, 28 films) for the home feed's
 * "Your Watchlist" row. Disabled until Letterboxd is connected; on web the
 * read runs through the Worker proxy (plan 0018).
 */
export function useLetterboxdWatchlistQuery(options: { enabled?: boolean } = {}) {
  const connected = useConnectedProviders();
  // Gate the MMKV read behind the connection check: `connected` is empty in
  // the SSR snapshot (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md),
  // so the username read below only ever runs on the client — the same pattern
  // the Serializd feed row uses (R16).
  const username = connected.includes('letterboxd')
    ? (getLetterboxdUsername() ?? '')
    : '';

  return useQuery({
    queryKey: letterboxdQueryKeys.watchlist(username),
    queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
    enabled: (options.enabled ?? true) && username !== '',
  });
}

/**
 * The tags this member already uses, most-used first — the suggestion source
 * behind the log sheet's tag picker. Disabled until Letterboxd is connected;
 * on web the read runs through the Worker proxy's third allowlist rule
 * (plan 0018 contract unchanged — `worker/letterboxd-proxy.ts`).
 *
 * Suggestions are an enhancement, never a dependency: a failed or unparseable
 * read resolves to `[]` at this boundary (no chips) rather than surfacing an
 * error the sheet would have to render.
 */
export function useLetterboxdTagsQuery() {
  const connected = useConnectedProviders();
  // Same SSR gate as the watchlist hooks: `connected` is empty in the server
  // snapshot (docs/solutions/expo-web-ssr-mmkv-storage-on-server.md), so the
  // MMKV username read below only ever runs on the client.
  const username = connected.includes('letterboxd')
    ? (getLetterboxdUsername() ?? '')
    : '';

  return useQuery({
    queryKey: letterboxdQueryKeys.tags(username),
    queryFn: (): Promise<LetterboxdTag[]> =>
      Effect.runPromise(getUserTags(letterboxdDeps())).catch(() => []),
    enabled: username !== '',
    staleTime: TAGS_STALE_MS,
    gcTime: TAGS_GC_MS,
  });
}

/**
 * The whole watchlist, one page (28 films) per cursor — behind the row's
 * "View all" grid (plan 0024 U9). Same shape as `use-diary-feed.ts`'s cursors:
 * a short page ends the list, and the page number *is* the cursor. Pages
 * already loaded stay loaded when a later one fails, so the grid degrades to a
 * footer retry rather than a blank screen.
 */
export function useLetterboxdWatchlistPagesQuery() {
  const connected = useConnectedProviders();
  // Same SSR gate as the single-page hook above: `connected` is empty in the
  // server snapshot, so the MMKV read only ever runs on the client.
  const username = connected.includes('letterboxd')
    ? (getLetterboxdUsername() ?? '')
    : '';

  return useInfiniteQuery({
    queryKey: letterboxdQueryKeys.watchlistPages(username),
    queryFn: ({ pageParam }) =>
      Effect.runPromise(getWatchlistPage(letterboxdDeps(), { page: pageParam })),
    initialPageParam: 1,
    getNextPageParam: (lastPage: NormalizedMediaItem[], _pages, lastPageParam) =>
      lastPage.length < WATCHLIST_PAGE_SIZE ? undefined : lastPageParam + 1,
    enabled: username !== '',
  });
}

/**
 * A watchlist changes when the user adds a film, which they do from Letterboxd
 * itself — the same slow-moving-personal-row window the home feed uses for its
 * catalogue slots. This read shares its cache entry with the "Your Watchlist"
 * row, so on the home screen the scrape behind Up Next's Letterboxd releases
 * has usually already happened.
 */
const WATCHLIST_STALE_MS = 15 * 60_000;

/**
 * A film's release dates only move when a studio moves them, so the catalogue
 * read rides the feed's stale window rather than refetching per gather
 * (`CATALOGUE_STALE_MS` in `use-unified-feed.ts` — deliberately re-stated here
 * rather than imported, since that module imports *this* one).
 */
const CATALOGUE_STALE_MS = 15 * 60_000;

/**
 * The two-call resolve behind Calendar's Letterboxd releases (plan 0030 KTD-5).
 *
 * Leg 1 is title+year → TMDB id, forever-cached and — critically — *year-gated*:
 * `cachedTmdbMovieIdByTitle` runs `pickMovieMatch`, which returns `null` rather
 * than the popular same-title classic when the year disagrees or the ±1 window
 * is ambiguous (docs/solutions/trakt-text-search-wrong-movie-match.md). A
 * dropped candidate is a missing agenda row; a guessed one puts the wrong film
 * in the user's week, so this leg never guesses.
 *
 * Leg 2 is the catalogue read, whose `release_dates` append carries the
 * `releaseCalendar` this whole resolve exists to learn. Merging rather than
 * replacing keeps the Letterboxd item's identity (its slug id routes the card)
 * while picking up the TMDB id and the dates.
 */
function resolveWatchlistFilm(
  queryClient: QueryClient,
): ResolveWatchlistFilm {
  return async (film) => {
    const tmdbId =
      film.externalIds.tmdb ??
      (await cachedTmdbMovieIdByTitle(queryClient, {
        title: film.title,
        year: film.year,
      }));
    if (tmdbId == null) return null;

    const catalogue = await queryClient.fetchQuery({
      queryKey: tmdbQueryKeys.catalogue('movie', tmdbId),
      queryFn: () =>
        Effect.runPromise(getMediaCatalogue(tmdbDeps(), { kind: 'movie', tmdbId })),
      staleTime: CATALOGUE_STALE_MS,
    });
    return mergeCatalogueMetadata(film, catalogue.catalogue);
  };
}

/**
 * Calendar's Letterboxd film releases — the watchlist's first page, year-
 * filtered and capped before any resolve runs (KTD-5). **First page only**, on
 * purpose: Letterboxd orders a watchlist most-recently-added first, so page 1
 * is where the films a user just put on their radar live, and paging the whole
 * 600-film list would trade ~22 HTML page fetches per gather for candidates the
 * year filter drops anyway.
 *
 * Without a TMDB token there is no resolve to run, so the source contributes
 * nothing rather than firing a fan that can only fail.
 */
export function fetchLetterboxdReleaseInputs(
  queryClient: QueryClient,
  now: Date,
): Promise<ReleaseUpNextInput[]> {
  const username = getLetterboxdUsername() ?? '';
  if (username === '' || tmdbToken() === '') return Promise.resolve([]);

  return queryClient
    .fetchQuery({
      queryKey: letterboxdQueryKeys.watchlist(username),
      queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
      staleTime: WATCHLIST_STALE_MS,
    })
    .then((films: NormalizedMediaItem[]) =>
      letterboxdReleaseInputs(films, now, resolveWatchlistFilm(queryClient)),
    );
}
