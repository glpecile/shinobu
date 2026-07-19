import type { HttpFetch } from '@/lib/http/types';

/**
 * Every TMDB effect takes this as its first argument — same dependency
 * injection as TraktDeps (docs/plans/0006, decision 4): tests pass fakes,
 * `state/queries/tmdb.ts` wires the real modules exactly once. TMDB is a
 * metadata source, not a tracker: no OAuth, no TokenStore — just the v4
 * read token.
 */
export interface TmdbDeps {
  fetch: HttpFetch;
  token: string;
}
