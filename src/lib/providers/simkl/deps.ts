import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

/** Dependencies for Simkl effects. The query layer supplies the session and transport. */
export interface SimklDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
  clientId: string;
}
