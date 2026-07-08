import { Effect } from 'effect';

import type { ProviderSession } from '@/types/session';
import { ProviderAuthError, type ProviderError } from '@/lib/providers/errors';
import type { TraktDeps } from './deps';
import { traktHttp } from './http';

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Epoch seconds. */
  created_at: number;
}

function toSession(token: TraktTokenResponse): ProviderSession {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: (token.created_at + token.expires_in) * 1000,
  };
}

/**
 * Authorization-code exchange (the code comes from expo-auth-session's
 * browser round-trip). Persists the session on success.
 */
export function exchangeCodeForSession(
  deps: TraktDeps,
  params: { code: string; redirectUri: string },
): Effect.Effect<ProviderSession, ProviderError> {
  return traktHttp<TraktTokenResponse>(deps, '/oauth/token', {
    method: 'POST',
    body: {
      code: params.code,
      client_id: deps.clientId,
      client_secret: deps.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    },
  }).pipe(
    Effect.map(toSession),
    Effect.tap((session) => Effect.sync(() => deps.tokens.set(session))),
  );
}

/**
 * Refresh-token grant. A *definitive* rejection (no refresh token, or the
 * token endpoint refusing the grant) clears the stored session and fails with
 * `ProviderAuthError { refreshFailed: true }` — the UI's only move is
 * "reconnect Trakt". Transient failures (network, rate limit) propagate
 * unchanged and leave the session intact: a blip must not log the user out.
 */
export function refreshSession(
  deps: TraktDeps,
): Effect.Effect<ProviderSession, ProviderError> {
  const refreshToken = deps.tokens.get()?.refreshToken;
  const dead = new ProviderAuthError({ provider: 'trakt', refreshFailed: true });

  if (refreshToken == null) {
    return Effect.fail(dead);
  }

  return traktHttp<TraktTokenResponse>(deps, '/oauth/token', {
    method: 'POST',
    body: {
      refresh_token: refreshToken,
      client_id: deps.clientId,
      client_secret: deps.clientSecret,
      grant_type: 'refresh_token',
    },
  }).pipe(
    Effect.map(toSession),
    Effect.tap((session) => Effect.sync(() => deps.tokens.set(session))),
    Effect.catchTag('ProviderAuthError', () =>
      Effect.sync(() => deps.tokens.clear()).pipe(Effect.zipRight(Effect.fail(dead))),
    ),
  );
}
