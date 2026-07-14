import type { ProviderSession } from '@/types/session';

/**
 * Read/write access to one provider's persisted session. `state/session/`
 * provides the MMKV-backed implementation; tests inject an in-memory fake.
 * Defined in lib/providers (not imported from state/) so the dependency arrow
 * stays state → lib/providers, never the reverse.
 */
export interface TokenStore {
  get(): ProviderSession | null;
  set(session: ProviderSession): void;
  clear(): void;
}
