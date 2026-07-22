import { Effect } from 'effect';

import {
  ProviderAuthError,
  ProviderDecodeError,
  ProviderNetworkError,
  ProviderRateLimitError,
  type ProviderError,
} from '@/lib/providers/errors';
import type { SerializdDeps } from './deps';

const provider = 'serializd' as const;

export interface SerializdCredentials {
  email: string;
  password: string;
}

export interface SerializdAuthResult {
  token: string;
  username: string;
}

/**
 * Login response shape varies across the open-source clients (KTD1): some
 * return `{ token, username }`, others `{ token, user: { username } }`. Parse
 * both; an absent token means the response wasn't a successful login.
 */
interface RawLoginResponse {
  token?: string;
  username?: string;
  user?: { username?: string };
  message?: string;
  error?: string;
}

function usernameFrom(raw: RawLoginResponse): string {
  return raw.username ?? raw.user?.username ?? '';
}

/** Best-effort JSON parse — returns null for an empty or non-JSON body. */
function tryParse<T>(text: string): T | null {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Exchange email/password for a bearer token (web connect, R5). Runs through
 * the proxy on web; the password is discarded by the caller after this resolves
 * (never persisted). Tolerates both login response shapes (KTD1).
 *
 * The body is read as text first, then parsed — a non-JSON body (e.g. the Expo
 * dev server's HTML fallback when the Serializd proxy isn't running, or a
 * Cloudflare/Render error page) yields an actionable message instead of a bare
 * "unreadable" decode failure.
 */
export function loginToSerializd(
  deps: SerializdDeps,
  credentials: SerializdCredentials,
): Effect.Effect<SerializdAuthResult, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(`${deps.baseUrl}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });
    const raw = tryParse<RawLoginResponse>(text);

    if (raw?.token != null && raw.token !== '') {
      return { token: raw.token, username: usernameFrom(raw) };
    }

    // No token: surface the API's own message when it sent JSON; otherwise the
    // body wasn't JSON at all (proxy missing / upstream error page) — say so.
    const detail =
      raw != null
        ? (raw.message ?? raw.error ?? `Serializd rejected the login (${response.status})`)
        : `Serializd sign-in isn't reachable (${response.status}). On web this needs the Serializd proxy — locally run \`bun run dev:worker\` alongside \`bun web\`, or use the deployed build.`;
    return yield* new ProviderDecodeError({ provider, detail });
  });
}

interface RawValidateResponse {
  isValid?: boolean;
  username?: string;
}

/**
 * Validate a captured token (both connect paths, R4/R5) and recover the
 * username. An invalid token maps to `ProviderAuthError({ refreshFailed: true })`
 * — the established "reconnect" failure (R7), never retried.
 */
export function validateAuthToken(
  deps: SerializdDeps,
  token: string,
): Effect.Effect<SerializdAuthResult, ProviderError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        deps.fetch(`${deps.baseUrl}/validateauthtoken`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });

    if (response.status === 429) {
      return yield* new ProviderRateLimitError({ provider });
    }
    if (!response.ok) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new ProviderNetworkError({ provider, cause }),
    });
    const raw = tryParse<RawValidateResponse>(text);

    if (raw?.isValid !== true) {
      return yield* new ProviderAuthError({ provider, refreshFailed: true });
    }

    return { token, username: raw.username ?? '' };
  });
}
