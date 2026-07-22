import { describe, expect, test } from 'bun:test';

import { extractSerializdLogin, SERIALIZD_TOKEN_COOKIE } from './session-cookies';

describe('extractSerializdLogin', () => {
  test('finds the token cookie among unrelated cookies', () => {
    const captured = extractSerializdLogin([
      { name: 'ph_session', value: 'analytics' },
      { name: SERIALIZD_TOKEN_COOKIE, value: 'the-token' },
      { name: 'theme', value: 'dark' },
    ]);
    expect(captured).toEqual({ accessToken: 'the-token' });
  });

  test('returns null while the token cookie is absent (keep the WebView open)', () => {
    expect(
      extractSerializdLogin([{ name: 'ph_session', value: 'analytics' }]),
    ).toBeNull();
  });

  test('ignores an empty token cookie value', () => {
    expect(
      extractSerializdLogin([{ name: SERIALIZD_TOKEN_COOKIE, value: '' }]),
    ).toBeNull();
  });
});
