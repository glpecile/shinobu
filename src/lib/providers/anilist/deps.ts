import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

/**
 * Every AniList effect takes this as its first argument — same DI-without-
 * Layers contract as TraktDeps (plan 0006 decision 4): tests pass fakes,
 * `state/queries/anilist.ts` wires the real modules exactly once. No client
 * id/secret here: API calls authenticate with the bearer token alone, and
 * the client id only matters to the authorize URL (config.ts).
 */
export interface AniListDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
}
