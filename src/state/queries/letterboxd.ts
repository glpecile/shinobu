import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { httpFetch } from '@/lib/http/client';
import type { LetterboxdDeps } from '@/lib/providers/letterboxd/deps';
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
 * Real dependency wiring for Letterboxd effects — same state → lib/providers
 * arrow as `traktDeps()`: the username (reads) and the captured web session
 * (writes) live here in state, injected into the provider lib.
 */
export function letterboxdDeps(): LetterboxdDeps {
  return {
    fetch: httpFetch,
    username: getLetterboxdUsername(),
    session: getLetterboxdSession(),
  };
}

/**
 * letterboxd.com sends no CORS headers, so the scrape/RSS reads only work
 * where requests aren't browser-bound — reads are native-only on web, the
 * local write queue works everywhere (docs/solutions/web-cors-letterboxd.md).
 */
export function letterboxdReadsAvailable(): boolean {
  return process.env.EXPO_OS !== 'web';
}

/**
 * Connect-time username validation at the Effect boundary. Only callable
 * where reads are available — the web connect flow saves unvalidated
 * (the validation fetch itself would be CORS-blocked).
 */
export function validateLetterboxdUsername(username: string): Promise<boolean> {
  return Effect.runPromise(
    checkUsernameExists({ fetch: httpFetch }, username),
  );
}

export const letterboxdQueryKeys = {
  all: ['letterboxd'] as const,
  watchlist: (username: string) =>
    [...letterboxdQueryKeys.all, 'watchlist', username] as const,
};

/**
 * The user's public watchlist (first page, 28 films) for the home feed's
 * "Your Watchlist" row. Disabled until Letterboxd is connected, and entirely
 * on web (no CORS — see letterboxdReadsAvailable).
 */
export function useLetterboxdWatchlistQuery(options: { enabled?: boolean } = {}) {
  const connected = useConnectedProviders();
  // Gate the MMKV read behind the platform check: web renders (including SSR,
  // where touching MMKV/localStorage throws — docs/solutions/
  // expo-web-ssr-mmkv-storage-on-server.md) never need the username because
  // the query is disabled there anyway.
  const username = letterboxdReadsAvailable()
    ? (getLetterboxdUsername() ?? '')
    : '';

  return useQuery({
    queryKey: letterboxdQueryKeys.watchlist(username),
    queryFn: () => Effect.runPromise(getWatchlist(letterboxdDeps())),
    enabled:
      (options.enabled ?? true) &&
      connected.includes('letterboxd') &&
      username !== '',
  });
}
