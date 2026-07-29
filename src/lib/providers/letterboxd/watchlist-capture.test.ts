import { describe, expect, test } from 'bun:test';

import {
  buildCaptureScript,
  captureReport,
  parseCaptureMessage,
  redactHeaders,
  shouldCapture,
  CAPTURE_MARKER,
} from './watchlist-capture';

/**
 * The spike's pure half (plan 0031 U6). Worth testing despite being a harness
 * for one reason: its output is meant to be **committed**, so the redaction is
 * a real contract, not a nicety.
 */

describe('redactHeaders', () => {
  test('credential headers never leave the page with their value', () => {
    const redacted = redactHeaders({
      'X-CSRF-TOKEN': 'abc123',
      Cookie: 'letterboxd.signed.in.as=gian',
      Authorization: 'Bearer nope',
      'Content-Type': 'application/json',
    });
    expect(redacted['X-CSRF-TOKEN']).toBe('«present, redacted»');
    expect(redacted.Cookie).toBe('«present, redacted»');
    expect(redacted.Authorization).toBe('«present, redacted»');
    // Presence still recorded — "did the site send a CSRF header at all" is
    // itself part of the finding.
    expect(Object.keys(redacted)).toContain('X-CSRF-TOKEN');
    expect(redacted['Content-Type']).toBe('application/json');
  });

  test('the match is case-insensitive — the page sets whatever casing it likes', () => {
    expect(redactHeaders({ cookie: 'x' }).cookie).toBe('«present, redacted»');
  });
});

describe('shouldCapture', () => {
  test('every state change is relayed', () => {
    expect(shouldCapture('POST', 'https://letterboxd.com/anything')).toBe(true);
    expect(shouldCapture('delete', 'https://letterboxd.com/anything')).toBe(true);
  });

  test('GETs are relayed only when they mention the watchlist', () => {
    // The page's own traffic would otherwise bury the one request being hunted.
    expect(shouldCapture('GET', 'https://letterboxd.com/ajax/poster/x')).toBe(false);
    expect(shouldCapture('GET', 'https://letterboxd.com/s/watch-list/add')).toBe(true);
    expect(shouldCapture('GET', 'https://letterboxd.com/gian/watchlist/')).toBe(true);
  });
});

describe('parseCaptureMessage', () => {
  test('ignores anything without the marker — the page posts its own messages', () => {
    expect(parseCaptureMessage('not json')).toBeNull();
    expect(parseCaptureMessage(JSON.stringify({ id: 'lb-1', status: 200 }))).toBeNull();
  });

  test('redacts on the way in, not only on the way out', () => {
    const parsed = parseCaptureMessage(
      JSON.stringify({
        marker: CAPTURE_MARKER,
        via: 'fetch',
        method: 'POST',
        url: 'https://letterboxd.com/api/v0/watchlist',
        headers: { 'X-CSRF-TOKEN': 'secret' },
        body: '{"productionId":"UH8e"}',
        status: 200,
        responseBody: '{"result":true}',
      }),
    );
    expect(parsed?.headers['X-CSRF-TOKEN']).toBe('«present, redacted»');
    expect(parsed?.method).toBe('POST');
    expect(parsed?.status).toBe(200);
  });
});

describe('buildCaptureScript', () => {
  test('is idempotent — a double onLoadEnd cannot double every capture', () => {
    expect(buildCaptureScript()).toContain('if (window.__shinobuWatchlistCapture) return');
  });

  test('reads the response from a clone, so the page keeps its own stream', () => {
    // Consuming the original would break the very control being driven.
    expect(buildCaptureScript()).toContain('response.clone()');
  });
});

describe('captureReport', () => {
  test('demands the classification rather than leaving it implied', () => {
    const report = captureReport([]);
    expect(report).toContain('add-only | toggle | add + separate remove');
    expect(report).toContain('does the RESPONSE say which of the two happened');
  });
});
