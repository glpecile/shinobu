import { describe, expect, test } from 'bun:test';

import { sessionFromImplicitRedirect } from './auth';

const NOW = 1_752_400_000_000;

describe('sessionFromImplicitRedirect', () => {
  test('parses token and expiry from the fragment', () => {
    const session = sessionFromImplicitRedirect(
      'shinobu://redirect#access_token=abc123&token_type=Bearer&expires_in=31536000',
      NOW,
    );
    expect(session).toEqual({
      accessToken: 'abc123',
      expiresAt: NOW + 31_536_000_000,
    });
  });

  test('no refresh token ever appears (implicit grant has none)', () => {
    const session = sessionFromImplicitRedirect(
      'https://shinobu.glpecile.xyz/#access_token=abc&expires_in=60',
      NOW,
    );
    expect(session?.refreshToken).toBeUndefined();
  });

  test('missing expires_in still yields a session without expiresAt', () => {
    const session = sessionFromImplicitRedirect(
      'shinobu://redirect#access_token=abc',
      NOW,
    );
    expect(session).toEqual({ accessToken: 'abc' });
  });

  test('a redirect without a fragment (denied) is null', () => {
    expect(sessionFromImplicitRedirect('shinobu://redirect', NOW)).toBeNull();
    expect(
      sessionFromImplicitRedirect('shinobu://redirect#error=access_denied', NOW),
    ).toBeNull();
  });
});
