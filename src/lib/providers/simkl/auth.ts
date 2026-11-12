import * as Effect from 'effect/Effect';
import { ProviderAuthError, type ProviderError } from '@/lib/providers/errors';
import { createPkcePair, randomUnreserved } from '@/lib/providers/pkce';
import { Provider } from '@/lib/providers/types';
import type { ProviderSession } from '@/types/session';
import {
  clearSimklAuthFlow,
  getSimklAuthFlow,
  saveSimklAuthFlow,
} from './auth-flow';
import { SIMKL_AUTHORIZE_URL, simklStandardParams } from './config';
import type { SimklDeps } from './deps';
import { simklHttp } from './http';

export {
  clearSimklAuthFlow,
  getSimklAuthFlow,
  saveSimklAuthFlow,
  type SimklAuthFlow,
} from './auth-flow';

const provider = Provider.Simkl;

// --- PKCE (plan 0034 KTD-1) -------------------------------------------------

const STATE_LENGTH = 32;

export {
  createPkcePair as createSimklPkcePair,
  deriveCodeChallenge as deriveSimklCodeChallenge,
  type PkcePair as SimklPkcePair,
} from '@/lib/providers/pkce';

// --- Authorize URL ----------------------------------------------------------

/**
 * `https://simkl.com/oauth/authorize?response_type=code&…` with the S256 PKCE
 * challenge and a CSRF `state`. Param names follow RFC 7636 / RFC 6749 as
 * Simkl's docs prescribe (api.simkl.org: OAuth 2.0 for web and mobile; public
 * clients use `code_verifier` + `code_challenge`, never a secret). The
 * quickstart's authorize example also carries `app-name`/`app-version`, so
 * the standard params ride along here too.
 */
export function buildSimklAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(SIMKL_AUTHORIZE_URL);
  for (const [key, value] of Object.entries(simklStandardParams(params.clientId))) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * One call for the connect button (U5): generates the PKCE pair and a random
 * `state`, persists both for the return leg, and hands back the URL to open.
 */
export async function beginSimklAuthFlow(params: {
  clientId: string;
  redirectUri: string;
}): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  const state = randomUnreserved(STATE_LENGTH);
  saveSimklAuthFlow({ verifier, state });
  return buildSimklAuthorizeUrl({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: challenge,
    state,
  });
}

// --- Token exchange ---------------------------------------------------------

interface SimklTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  /** ~157680000 (5 years); may be absent — tokens live until revoked (KTD-2). */
  expires_in?: number;
}

function toSession(token: SimklTokenResponse): ProviderSession {
  return {
    accessToken: token.access_token,
    // No refreshToken: Simkl has no refresh grant (KTD-2) — a 401 means
    // "reconnect Simkl", exactly like AniList's implicit-grant sessions.
    ...(token.expires_in != null
      ? { expiresAt: Date.now() + token.expires_in * 1000 }
      : {}),
  };
}

/**
 * Authorization-code exchange, PKCE-style: `code_verifier` instead of a client
 * secret (KTD-1 — no secret field exists anywhere in this flow). The returned
 * `state` must match the one persisted by `beginSimklAuthFlow`; on mismatch
 * (or no flow in flight) the code is untrusted and is never POSTed. The stored
 * verifier/state are cleared once the exchange settles — success or failure —
 * so a stale flow can never be replayed. Persists the session on success.
 */
export function exchangeSimklCode(
  deps: SimklDeps,
  params: { code: string; state: string; redirectUri: string },
): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.gen(function* () {
    const flow = getSimklAuthFlow();
    if (flow == null || flow.state !== params.state) {
      return yield* new ProviderAuthError({ provider, refreshFailed: false });
    }

    const token = yield* simklHttp<SimklTokenResponse>(deps, '/oauth/token', {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code: params.code,
        code_verifier: flow.verifier,
        client_id: deps.clientId,
        redirect_uri: params.redirectUri,
      },
    });

    const session = toSession(token);
    deps.tokens.set(session);
    return session;
  }).pipe(Effect.ensuring(Effect.sync(() => clearSimklAuthFlow())));
}
