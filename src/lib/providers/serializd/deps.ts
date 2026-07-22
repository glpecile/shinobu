import type { HttpFetch } from '@/lib/http/types';

/**
 * The captured Serializd session — the bearer token that authorizes writes and
 * the username that scopes reads (KTD1). Stored in the existing `ProviderSession`
 * as `{ accessToken, username }` (no new session fields). Mobile captures the
 * token from the sign-in WebView cookie jar (`tvproject_credentials`); web
 * exchanges email/password at `/login` through the proxy.
 */
export interface SerializdSession {
  /** The bearer token — sent as `Authorization: Bearer {token}` on every call. */
  accessToken: string;
  username: string;
}

/**
 * Every Serializd effect takes this as its first argument — the same
 * deps-injection-without-Layers pattern as TraktDeps/LetterboxdDeps. Tests pass
 * a fake `fetch`; `state/queries/serializd.ts` wires the platform transport.
 *
 * `baseUrl` is the transport seam (KTD4): native resolves it to the upstream
 * host (nitro-fetch attaches the app headers), web to the same-origin
 * `/api/serializd` proxy path (the proxy attaches them). Provider modules never
 * branch on platform — they only ever read `deps.baseUrl` + `deps.fetch`.
 */
export interface SerializdDeps {
  fetch: HttpFetch;
  baseUrl: string;
  /** Present once connected; absent for the pre-connect login/validate calls. */
  session?: SerializdSession | null;
}
