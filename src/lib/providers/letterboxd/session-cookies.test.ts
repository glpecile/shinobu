import { describe, expect, it } from 'bun:test';

import {
  captureLoginFromCookies,
  type CookiePair,
} from './session-cookies';

const signedIn = (extra: CookiePair[] = []): CookiePair[] => [
  { name: 'letterboxd.signed.in.as', value: 'gian' },
  { name: 'com.xk72.webparts.csrf', value: 'abc123' },
  ...extra,
];

describe('captureLoginFromCookies', () => {
  it('returns null when the signed-in marker cookie is absent', () => {
    expect(
      captureLoginFromCookies([
        { name: 'com.xk72.webparts.csrf', value: 'abc123' },
        { name: '_ga', value: 'GA1.1.2' },
      ]),
    ).toBeNull();
  });

  it('returns null when the csrf cookie is absent', () => {
    expect(
      captureLoginFromCookies([
        { name: 'letterboxd.signed.in.as', value: 'gian' },
      ]),
    ).toBeNull();
  });

  it('returns null when the marker cookie is present but empty', () => {
    expect(
      captureLoginFromCookies([
        { name: 'letterboxd.signed.in.as', value: '' },
        { name: 'com.xk72.webparts.csrf', value: 'abc123' },
      ]),
    ).toBeNull();
  });

  it('captures the username and csrf from the marker cookies', () => {
    const captured = captureLoginFromCookies(signedIn());
    expect(captured).not.toBeNull();
    expect(captured?.username).toBe('gian');
    expect(captured?.session.csrf).toBe('abc123');
  });

  it('forwards every non-empty cookie in the Cookie header, httpOnly included', () => {
    const captured = captureLoginFromCookies(
      signedIn([
        // The real auth cookie is httpOnly; we never name it, only forward it.
        { name: 'com.xk72.malt', value: 'session-token' },
        { name: '_ga', value: 'GA1.1.2' },
        { name: 'dropped', value: '' },
      ]),
    );
    expect(captured?.session.cookie).toBe(
      'letterboxd.signed.in.as=gian; com.xk72.webparts.csrf=abc123; com.xk72.malt=session-token; _ga=GA1.1.2',
    );
  });

  it('decodes a percent-encoded username value', () => {
    const captured = captureLoginFromCookies([
      { name: 'letterboxd.signed.in.as', value: 'gian%20p' },
      { name: 'com.xk72.webparts.csrf', value: 'abc123' },
    ]);
    expect(captured?.username).toBe('gian p');
  });
});
