import { Effect, type Either } from 'effect';

import type { ProviderSession } from '@/types/session';
import { ProviderAuthError, type ProviderError } from '@/lib/providers/errors';
import type { TokenStore, TraktDeps } from './deps';
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

  // Detachment guard (plan 0034 U9): with no resolvable client credentials
  // the grant cannot succeed — fail fast, with NO network round-trip and,
  // critically, WITHOUT the clear-on-rejection below. The stored token is the
  // evidence behind the MigrationNeeded banner (R13); clearing it here would
  // be the silent logout the plan forbids.
  if (deps.clientId === '' || deps.clientSecret === '') {
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

const inflightRefreshes = new WeakMap<
  TokenStore,
  Promise<Either.Either<ProviderSession, ProviderError>>
>();

/**
 * `refreshSession` with in-flight coalescing — what `traktAuthedRequest` uses.
 * When the access token expires, every concurrent authed request 401s at
 * once; Trakt rotates refresh tokens, so parallel refresh grants race and the
 * losers get a definitive rejection — which the clear-on-rejection handling
 * above would read as a dead session, wiping the fresh tokens the winner just
 * stored and silently logging the user out. Keyed by token store identity
 * (one per provider session; test fakes stay isolated). Bridged through a
 * plain Promise because each query runs in its own `Effect.runPromise` fiber
 * — there is no shared runtime for `Effect.cached` to live in.
 */
export function coalescedRefreshSession(
  deps: TraktDeps,
): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.promise(() => {
    let inflight = inflightRefreshes.get(deps.tokens);
    if (inflight == null) {
      inflight = Effect.runPromise(Effect.either(refreshSession(deps))).finally(
        () => inflightRefreshes.delete(deps.tokens),
      );
      inflightRefreshes.set(deps.tokens, inflight);
    }
    return inflight;
  }).pipe(Effect.flatMap((outcome) => outcome));
}
