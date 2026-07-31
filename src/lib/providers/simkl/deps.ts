import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';

/**
 * Every Simkl effect takes this as its first argument — the same
 * deps-injection-without-Layers pattern as TraktDeps/SerializdDeps: tests pass
 * fakes, `state/queries/simkl.ts` wires the real modules exactly once.
 *
 * Unlike TraktDeps there is no `clientSecret`: Simkl auth is PKCE (plan 0034
 * KTD-1) — a public client with no secret anywhere. And no refresh machinery
 * hangs off `tokens` either: Simkl tokens live ~5 years with no refresh grant
 * (KTD-2), so a 401 is a dead session, never a refresh trigger.
 */
export interface SimklDeps {
  fetch: HttpFetch;
  tokens: TokenStore;
  clientId: string;
}
