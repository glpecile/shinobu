import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

export interface AniListDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
}
