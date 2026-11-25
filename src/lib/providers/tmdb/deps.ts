import type { HttpFetch } from '@/lib/http/types';

export interface TmdbDeps {
  fetch: HttpFetch;
  token: string;
}
