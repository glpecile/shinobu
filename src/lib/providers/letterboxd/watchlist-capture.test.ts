import { describe, expect, test } from 'bun:test';

import { parseCaptureMessage, CAPTURE_MARKER } from './watchlist-capture';

/**
 * The spike's pure half (plan 0031 U6). Worth testing despite being a harness
 * for one reason: its output is meant to be **committed**, so the redaction is
 * a real contract, not a nicety.
 */

describe('parseCaptureMessage', () => {
  test('ignores anything without the marker — the page posts its own messages', () => {
    expect(parseCaptureMessage('not json')).toBeNull();
    expect(parseCaptureMessage(JSON.stringify({ id: 'lb-1', status: 200 }))).toBeNull();
  });

  test('credential headers never leave the page with their value', () => {
    const parsed = parseCaptureMessage(
      JSON.stringify({
        marker: CAPTURE_MARKER,
        via: 'fetch',
        method: 'POST',
        url: 'https://letterboxd.com/api/v0/watchlist',
        headers: {
          'X-CSRF-TOKEN': 'secret',
          Cookie: 'letterboxd.signed.in.as=gian',
          Authorization: 'Bearer nope',
          'Content-Type': 'application/json',
        },
        body: '{"productionId":"UH8e"}',
        status: 200,
        responseBody: '{"result":true}',
      }),
    );
    // Presence is still recorded: whether the site sent a CSRF header at all
    // is part of the finding.
    expect(parsed?.headers).toEqual({
      'X-CSRF-TOKEN': '«present, redacted»',
      Cookie: '«present, redacted»',
      Authorization: '«present, redacted»',
      'Content-Type': 'application/json',
    });
    expect(parsed?.method).toBe('POST');
    expect(parsed?.status).toBe(200);
  });
});
