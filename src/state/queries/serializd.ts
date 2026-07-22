import { serializdBaseUrl, serializdFetch } from '@/lib/providers/serializd/transport';
import type { SerializdDeps } from '@/lib/providers/serializd/deps';
import { getSerializdSession } from '@/state/session/serializd';

/**
 * Real dependency wiring for Serializd effects — same state → lib/providers
 * arrow as `traktDeps()`/`letterboxdDeps()`. The transport (`fetch` + `baseUrl`)
 * is the platform seam (KTD4): native reaches the upstream host with app
 * headers, web the same-origin proxy. Works on every platform (R13) — no
 * `EXPO_OS` gate.
 */
export function serializdDeps(): SerializdDeps {
  return {
    fetch: serializdFetch,
    baseUrl: serializdBaseUrl,
    session: getSerializdSession(),
  };
}

/**
 * Query keys rooted at `['serializd', …]` (matches disconnect's
 * `removeQueries({ queryKey: ['serializd'] })`, R6). The diary/progress keys
 * include the username so reconnecting as a different account never serves the
 * prior account's entries (Letterboxd's pattern).
 *
 * There is deliberately no cached season-id query: writes resolve the seasonId
 * inline on every log (`resolveSeasonId`), which *self-heals* a
 * currently-airing season Serializd hasn't ingested yet — a forever-cache would
 * be the very thing that permanently skips later episodes (KTD6). The one extra
 * GET per log is within the politeness budget (KTD7).
 */
export const serializdQueryKeys = {
  all: ['serializd'] as const,
  diary: (username: string) => [...serializdQueryKeys.all, 'diary', username] as const,
  progress: (username: string, tmdbId: number) =>
    [...serializdQueryKeys.all, 'progress', username, tmdbId] as const,
};
