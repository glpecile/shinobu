import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

// The TokenStore contract moved to lib/providers/token-store.ts when AniList
// landed (plan 0011); re-exported so existing Trakt imports keep working.
export type { TokenStore } from '@/lib/providers/token-store';

/**
 * Every Trakt effect takes this as its first argument — dependency injection
 * without Effect Layers (docs/plans/0006, decision 4): tests pass fakes,
 * `state/queries/trakt.ts` wires the real modules exactly once.
 */
export interface TraktDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
  clientId: string;
  clientSecret: string;
}
