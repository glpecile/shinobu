import type { ProviderSession } from '@/types/session';

/**
 * Parses the implicit-grant redirect (`…#access_token=…&token_type=Bearer&
 * expires_in=…`) into a session. There is no code exchange and no refresh
 * token — the fragment *is* the whole grant (plan 0011 decision 1; otraku
 * does exactly this in its /auth route). Returns null for redirects without
 * a usable token (denied, malformed) so callers surface "connect failed"
 * instead of persisting garbage.
 */
export function sessionFromImplicitRedirect(
  url: string,
  nowMs: number,
): ProviderSession | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  if (accessToken == null || accessToken === '') return null;

  const expiresIn = Number(params.get('expires_in'));
  return {
    accessToken,
    ...(Number.isFinite(expiresIn) && expiresIn > 0
      ? { expiresAt: nowMs + expiresIn * 1000 }
      : {}),
  };
}
