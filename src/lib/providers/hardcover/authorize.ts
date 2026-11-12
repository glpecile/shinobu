import { createPkcePair, randomUnreserved } from '@/lib/providers/pkce';
import { saveHardcoverAuthFlow } from './auth-flow';
import { HARDCOVER_AUTHORIZE_URL, HARDCOVER_SCOPES } from './config';

const STATE_LENGTH = 32;

/**
 * Persists the PKCE verifier and `state` for the return leg and hands back
 * the authorize URL to open. Apart from `auth.ts`, so the session layer can
 * load the exchange, refresh and revoke without expo-crypto.
 */
export async function beginHardcoverAuthFlow(params: {
  clientId: string;
  redirectUri: string;
}): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  const state = randomUnreserved(STATE_LENGTH);
  saveHardcoverAuthFlow({ verifier, state });
  const url = new URL(HARDCOVER_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', HARDCOVER_SCOPES.join(' '));
  return url.toString();
}
