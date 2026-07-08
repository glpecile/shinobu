import type { HttpFetch } from '@/lib/http/types';
import type { ProviderSession } from '@/types/session';

/**
 * Read/write access to the persisted Trakt session. `state/session/` provides
 * the MMKV-backed implementation; tests inject an in-memory fake. Defined here
 * (not imported from state/) so the dependency arrow stays
 * state → lib/providers, never the reverse.
 */
export interface TokenStore {
  get(): ProviderSession | null;
  set(session: ProviderSession): void;
  clear(): void;
}

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
