import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import type { HttpFetch } from '@/lib/http/types';
import {
  LETTERBOXD_BASE_URL,
  LETTERBOXD_WEB_PROXY_BASE_URL,
} from '@/lib/providers/letterboxd/config';
import type { LetterboxdDeps } from '@/lib/providers/letterboxd/deps';
import { getLetterboxdWebFetch } from '@/lib/providers/letterboxd/webview-bridge';
import {
  checkUsernameExists,
  getWatchlist,
} from '@/lib/providers/letterboxd/watchlist';
import {
  getLetterboxdSession,
  getLetterboxdUsername,
} from '@/state/session/letterboxd';
import { useConnectedProviders } from '@/state/session';

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
  /**
   * The user's public diary (RSS window) — the Letterboxd diary source
   * (plan 0016). Keyed by username so reconnecting as a different account
   * never serves the prior account's entries. On web it reads through the
   * Worker proxy (plan 0018); native reads letterboxd.com directly.
   */
  diary: (username: string) =>
    [...letterboxdQueryKeys.all, 'diary', username] as const,
};

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
