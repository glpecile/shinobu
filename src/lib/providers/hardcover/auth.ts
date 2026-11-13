import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import type * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import { optionalNullable } from '@/lib/providers/schema';
import type { TokenStore } from '@/lib/providers/token-store';
import { Provider } from '@/lib/providers/types';
import type { ProviderSession } from '@/types/session';
import { clearHardcoverAuthFlow, getHardcoverAuthFlow } from './auth-flow';
import { HARDCOVER_ISSUER, HARDCOVER_REVOKE_URL, HARDCOVER_TOKEN_URL } from './config';
import type { HardcoverDeps } from './deps';

const provider = Provider.Hardcover;

/**
 * How long refreshes stay off after the token endpoint answers 429 without a
 * readable `Retry-After`. That is every 429 on a deployed web origin, where
 * the endpoint exposes no response headers
 * (docs/solutions/web-cors-hardcover.md).
 */
const REFRESH_BACKOFF_MS = 60_000;

const tokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: optionalNullable(Schema.String),
  /** Seconds. */
  expires_in: optionalNullable(Schema.Number),
});
const oauthError = Schema.Struct({ error: optionalNullable(Schema.String) });

/**
 * One POST to the token or revoke endpoint. Never retried: a code and a
 * refresh token are both single-use, and a request that got no answer may
 * still have spent one. Every failure but a 429 is marked not retryable so
 * TanStack Query does not replay the call that led here.
 *
 * The body is form-encoded, which keeps the request CORS-simple. `fetch`
 * runs with its default credentials mode on purpose: these endpoints answer
 * `access-control-allow-origin: *` and set cookies, and a browser rejects
 * `*` on a credentialed request.
 */
function oauthPost(
  deps: HardcoverDeps,
  url: string,
  body: Record<string, string>,
): Effect.Effect<Response, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        deps.fetch(url, {
          signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body).toString(),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause, retryable: false }),
    });
    if (response.ok) return response;

    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      return yield* new ProviderRateLimitError({
        provider,
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : REFRESH_BACKOFF_MS,
      });
    }
    const error = yield* Effect.tryPromise(() => response.json()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(oauthError)),
      Effect.map((decoded) => decoded.error),
      Effect.orElseSucceed(() => undefined),
    );
    // The server refused this code or refresh token for good.
    if (error === 'invalid_grant') {
      return yield* new ProviderAuthError({ provider, refreshFailed: false });
    }
    return yield* new ProviderNetworkError({
      provider,
      status: response.status,
      retryable: false,
      cause: new Error(`Hardcover responded ${response.status}${error != null ? ` (${error})` : ''}`),
    });
  });
}

function tokenGrant(
  deps: HardcoverDeps,
  body: Record<string, string>,
): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* oauthPost(deps, HARDCOVER_TOKEN_URL, body);
    const json = yield* Effect.tryPromise({
      try: (): Promise<unknown> => response.json(),
      catch: () => new ProviderDecodeError({ provider, detail: 'non-JSON token response' }),
    });
    const token = yield* Schema.decodeUnknownEffect(tokenResponse)(json).pipe(
      Effect.mapError(
        (error) => new ProviderDecodeError({ provider, detail: `invalid token response: ${error.message}` }),
      ),
    );
    const now = yield* Clock.currentTimeMillis;
    const session: ProviderSession = {
      accessToken: token.access_token,
      ...(token.refresh_token != null ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in != null ? { expiresAt: now + token.expires_in * 1000 } : {}),
    };
    deps.tokens.set(session);
    return session;
  });
}

/**
 * Authorization-code exchange. `state` must match the pending flow and `iss`
 * must name Hardcover (RFC 9207) before the code is sent anywhere. The stored
 * verifier and state are cleared when the exchange settles, so a stale flow
 * cannot validate a later code. Persists the session on success.
 */
export function exchangeHardcoverCode(
  deps: HardcoverDeps,
  params: { code: string; state: string; iss: string | null; redirectUri: string },
): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.gen(function* () {
    const flow = getHardcoverAuthFlow();
    if (flow == null || flow.state !== params.state || params.iss !== HARDCOVER_ISSUER) {
      return yield* new ProviderAuthError({ provider, refreshFailed: false });
    }
    return yield* tokenGrant(deps, {
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: deps.clientId,
      code_verifier: flow.verifier,
    });
  }).pipe(Effect.ensuring(Effect.sync(() => clearHardcoverAuthFlow())));
}

const refreshCooldowns = new WeakMap<TokenStore, number>();

/**
 * One refresh-token grant. Hardcover rotates the refresh token on every use
 * and revokes the whole chain when a spent one is replayed.
 *
 * - `invalid_grant`, or no refresh token to send: the chain is dead. The
 *   session is kept and marked `reconnectNeeded`, which takes Hardcover out
 *   of every read and write and shows the reconnect banner. It is never
 *   cleared here.
 * - 429: the request did not run. Refreshes stay off for the cooldown and
 *   fail without a request.
 * - Anything else (no answer, 5xx, a body that does not decode): the outcome
 *   is unknown and the token may be spent, so it is never sent again. The
 *   session is marked `reconnectNeeded` as for a refusal, and the call fails
 *   with the original error.
 */
function refreshSession(deps: HardcoverDeps): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.gen(function* () {
    const dead = new ProviderAuthError({ provider, refreshFailed: true });
    const session = deps.tokens.get();
    if (session == null || session.reconnectNeeded === true) return yield* dead;
    const markDead = () => deps.tokens.set({ ...session, reconnectNeeded: true });
    if (session.refreshToken == null) {
      markDead();
      return yield* dead;
    }

    const now = yield* Clock.currentTimeMillis;
    const remaining = (refreshCooldowns.get(deps.tokens) ?? 0) - now;
    if (remaining > 0) {
      return yield* new ProviderRateLimitError({ provider, retryAfterMs: remaining });
    }

    return yield* tokenGrant(deps, {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: deps.clientId,
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (error._tag === 'ProviderRateLimitError') {
            refreshCooldowns.set(deps.tokens, now + (error.retryAfterMs ?? REFRESH_BACKOFF_MS));
          } else {
            markDead();
          }
        }),
      ),
      Effect.catchTag('ProviderAuthError', () => Effect.fail(dead)),
    );
  });
}

const inflightRefreshes = new WeakMap<
  TokenStore,
  Promise<Result.Result<ProviderSession, ProviderError>>
>();

/**
 * The refresh `hardcoverRequest` runs after a 401 on `usedAccessToken`. At
 * most one refresh request leaves this browser or device at a time:
 *
 * - Concurrent callers in one process share one in-flight promise, keyed by
 *   token store like Trakt's `coalescedRefreshSession`.
 * - Across web tabs the refresh holds `deps.refreshLock`.
 * - Once it holds the lock, a caller whose 401 came from a token that is no
 *   longer the stored one takes the stored session: another caller or tab
 *   rotated it first, and a second grant would waste a rotation.
 *
 * The refresh runs on its own fiber, so a caller that is interrupted (a
 * cancelled query) never aborts a grant that is already on the wire.
 */
export function coalescedRefreshSession(
  deps: HardcoverDeps,
  usedAccessToken: string,
): Effect.Effect<ProviderSession, ProviderError> {
  return Effect.promise(() => {
    let inflight = inflightRefreshes.get(deps.tokens);
    if (inflight == null) {
      inflight = deps
        .refreshLock(() => {
          const stored = deps.tokens.get();
          const rotated =
            stored != null &&
            stored.reconnectNeeded !== true &&
            stored.accessToken !== usedAccessToken;
          return Effect.runPromise(
            Effect.result(rotated ? Effect.succeed(stored) : refreshSession(deps)),
          );
        })
        .finally(() => inflightRefreshes.delete(deps.tokens));
      inflightRefreshes.set(deps.tokens, inflight);
    }
    return inflight;
  }).pipe(Effect.flatMap(Effect.fromResult));
}

/**
 * Ends this session on Hardcover, which lists each app's sessions to the
 * member. Sends the refresh token when there is one, so the session cannot be
 * reactivated. Best effort: disconnect clears the local session either way.
 */
export function revokeHardcoverSession(
  deps: HardcoverDeps,
  session: ProviderSession,
): Effect.Effect<void, ProviderError> {
  return oauthPost(deps, HARDCOVER_REVOKE_URL, {
    token: session.refreshToken ?? session.accessToken,
    token_type_hint: session.refreshToken != null ? 'refresh_token' : 'access_token',
    client_id: deps.clientId,
  }).pipe(Effect.asVoid);
}
