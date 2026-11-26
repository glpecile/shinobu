import type { ProviderSession } from '@/types/session';

export function sessionFromImplicitRedirect(url: string, nowMs: number): ProviderSession | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  if (accessToken == null || accessToken === '') return null;

  const expiresIn = Number(params.get('expires_in'));
  return {
    accessToken,
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAt: nowMs + expiresIn * 1000 } : {}),
  };
}
