import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

/**
 * Every Hardcover effect takes this first, like `SimklDeps`: tests pass
 * fakes and `state/queries/hardcover.ts` wires the real modules once.
 */
export interface HardcoverDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
  clientId: string;
  /**
   * Runs one token refresh while holding a lock shared by every tab of this
   * browser (Web Locks). Hardcover rotates the refresh token on each use and
   * revokes the whole chain when one is replayed, so two tabs must never
   * spend the same token. Native has one process and runs `run` directly.
   */
  refreshLock: <A>(run: () => Promise<A>) => Promise<A>;
}
