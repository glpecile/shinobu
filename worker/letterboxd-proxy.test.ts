import { describe, expect, test } from 'bun:test';

import {
  handleLetterboxdProxy,
  isLetterboxdProxyRequest,
} from './letterboxd-proxy';
import {
  handleLetterboxdWriteSpike,
  isLetterboxdWriteSpikeRequest,
} from './letterboxd-write-spike';

const ORIGIN = 'https://shinobu.glpecile.xyz';

interface Captured {
  url: string;
  init?: RequestInit;
}

/** An upstream fetch stub that records what the proxy sent and returns `response`. */
function capturingUpstream(response: Response): {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  captured: Captured[];
} {
  const captured: Captured[] = [];
  return {
    captured,
    fetch: async (url, init) => {
      captured.push({ url, init });
      return response;
    },
  };
}

function proxyRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

const HTML = '<!doctype html><html><body>watchlist</body></html>';
const RSS = '<?xml version="1.0"?><rss><channel></channel></rss>';

function htmlResponse(status = 200): Response {
  return new Response(HTML, {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
  });
}

describe('isLetterboxdProxyRequest', () => {
  test('matches the /api/letterboxd/ prefix only', () => {
    expect(
      isLetterboxdProxyRequest(new URL(`${ORIGIN}/api/letterboxd/gian/watchlist/`)),
    ).toBe(true);
    expect(isLetterboxdProxyRequest(new URL(`${ORIGIN}/api/serializd/show/1`))).toBe(false);
    expect(isLetterboxdProxyRequest(new URL(`${ORIGIN}/`))).toBe(false);
  });
});

describe('allowlist', () => {
  test('passes the two read shapes through to upstream', async () => {
    for (const path of [
      '/api/letterboxd/gian/watchlist/',
      '/api/letterboxd/gian/rss/',
      '/api/letterboxd/User_Name-9/watchlist/',
    ]) {
      const upstream = capturingUpstream(htmlResponse());
      const res = await handleLetterboxdProxy(proxyRequest(path), upstream.fetch);
      expect(res.status).toBe(200);
      expect(upstream.captured).toHaveLength(1);
    }
  });

  test('forwards to letterboxd.com with the sub-path verbatim', async () => {
    const upstream = capturingUpstream(htmlResponse());
    await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      upstream.fetch,
    );
    expect(upstream.captured[0].url).toBe('https://letterboxd.com/gian/watchlist/');
  });

  test('any non-GET method on an allowlisted path is 405', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const upstream = capturingUpstream(htmlResponse());
      const res = await handleLetterboxdProxy(
        proxyRequest('/api/letterboxd/gian/rss/', { method, body: '{}' }),
        upstream.fetch,
      );
      expect(res.status).toBe(405);
      expect(upstream.captured).toHaveLength(0);
    }
  });

  test('unlisted paths, malformed usernames, and traversal tricks are 404, never forwarded', async () => {
    for (const path of [
      '/api/letterboxd/gian/films/',
      '/api/letterboxd/gian/watchlist',
      '/api/letterboxd/film/tuner/',
      '/api/letterboxd/api/v0/production-log-entries',
      '/api/letterboxd/gian/watchlist/extra/',
      '/api/letterboxd/gi an/watchlist/',
      '/api/letterboxd/../secret',
      '/api/letterboxd/gian/../../etc',
      '/api/letterboxd/https://evil.test/watchlist/',
      '/api/letterboxd/',
    ]) {
      const upstream = capturingUpstream(htmlResponse());
      const res = await handleLetterboxdProxy(proxyRequest(path), upstream.fetch);
      expect(res.status).toBe(404);
      expect(upstream.captured).toHaveLength(0);
    }
  });
});

describe('request hardening', () => {
  test('forwards no client headers — no Cookie, no Authorization, nothing else', async () => {
    const upstream = capturingUpstream(htmlResponse());
    await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/', {
        headers: {
          Cookie: 'session=secret',
          Authorization: 'Bearer tok',
          'X-Evil': 'nope',
        },
      }),
      upstream.fetch,
    );
    const headers = upstream.captured[0].init?.headers as Record<string, string>;
    expect(headers.Cookie).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Evil']).toBeUndefined();
    // A fixed server-side UA is attached instead of anything client-supplied.
    expect(headers['User-Agent']).toContain('Mozilla/5.0');
  });

  test('an upstream timeout maps to 504', async () => {
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      async () => {
        throw new Error('timed out');
      },
    );
    expect(res.status).toBe(504);
  });
});

describe('response relay', () => {
  test('passes the upstream status through (404 stays 404)', async () => {
    const upstream = capturingUpstream(htmlResponse(404));
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/ghost/watchlist/'),
      upstream.fetch,
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(HTML);
  });

  test('relays RSS with its XML content type', async () => {
    const upstream = capturingUpstream(
      new Response(RSS, { headers: { 'content-type': 'text/xml; charset=UTF-8' } }),
    );
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/rss/'),
      upstream.fetch,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/xml; charset=UTF-8');
    expect(await res.text()).toBe(RSS);
  });

  test('relayed markup is CSP-locked + nosniff so direct navigation cannot execute it', async () => {
    const upstream = capturingUpstream(htmlResponse());
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      upstream.fetch,
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('the Cloudflare challenge page maps to a clean 502 JSON, never relayed', async () => {
    const challenge = new Response(
      '<!doctype html><html><head><title>Just a moment...</title></head></html>',
      { status: 403, headers: { 'content-type': 'text/html' } },
    );
    const upstream = capturingUpstream(challenge);
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      upstream.fetch,
    );
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.text()).not.toContain('Just a moment');
  });

  test('an unexpected content type is never relayed verbatim', async () => {
    const upstream = capturingUpstream(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      upstream.fetch,
    );
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('emits no Access-Control-Allow-Origin and no upstream Set-Cookie', async () => {
    const upstream = capturingUpstream(
      new Response(HTML, {
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'cf_clearance=abc; HttpOnly',
        },
      }),
    );
    const res = await handleLetterboxdProxy(
      proxyRequest('/api/letterboxd/gian/watchlist/'),
      upstream.fetch,
    );
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

// --- Throwaway write spike (plan 0018 phase-0 re-spike) ---------------------

describe('letterboxd write spike (throwaway)', () => {
  const SPIKE = '/api/letterboxd/spike/production-log-entries';

  test('matches the spike path only', () => {
    expect(isLetterboxdWriteSpikeRequest(new URL(`${ORIGIN}${SPIKE}`))).toBe(true);
    expect(
      isLetterboxdWriteSpikeRequest(new URL(`${ORIGIN}/api/letterboxd/gian/rss/`)),
    ).toBe(false);
  });

  test('is POST-only', async () => {
    const upstream = capturingUpstream(Response.json({}));
    const res = await handleLetterboxdWriteSpike(proxyRequest(SPIKE), upstream.fetch);
    expect(res.status).toBe(405);
    expect(upstream.captured).toHaveLength(0);
  });

  test('forwards Cookie/UA/CSRF to the production-log-entries endpoint', async () => {
    const upstream = capturingUpstream(Response.json({ result: false }, { status: 401 }));
    await handleLetterboxdWriteSpike(
      proxyRequest(SPIKE, {
        method: 'POST',
        body: '{}',
        headers: {
          Cookie: 'session=abc',
          'User-Agent': 'TestBrowser/1.0',
          'X-CSRF-TOKEN': 'csrf-123',
          'X-Evil': 'nope',
        },
      }),
      upstream.fetch,
    );
    expect(upstream.captured[0].url).toBe(
      'https://letterboxd.com/api/v0/production-log-entries',
    );
    const headers = upstream.captured[0].init?.headers as Record<string, string>;
    expect(headers.Cookie).toBe('session=abc');
    expect(headers['User-Agent']).toBe('TestBrowser/1.0');
    expect(headers['X-CSRF-TOKEN']).toBe('csrf-123');
    expect(headers['X-Evil']).toBeUndefined();
  });

  test('classifies the Cloudflare challenge page as challenged', async () => {
    const challenge = new Response(
      '<html><head><title>Just a moment...</title></head></html>',
      { status: 403, headers: { 'content-type': 'text/html' } },
    );
    const upstream = capturingUpstream(challenge);
    const res = await handleLetterboxdWriteSpike(
      proxyRequest(SPIKE, { method: 'POST', body: '{}' }),
      upstream.fetch,
    );
    const payload = (await res.json()) as { challenged: boolean };
    expect(payload.challenged).toBe(true);
  });

  test('a non-challenge response (reached Rails) is challenged: false', async () => {
    const upstream = capturingUpstream(
      Response.json({ result: false, messages: ['Sign in'] }, { status: 401 }),
    );
    const res = await handleLetterboxdWriteSpike(
      proxyRequest(SPIKE, { method: 'POST', body: '{}' }),
      upstream.fetch,
    );
    const payload = (await res.json()) as {
      challenged: boolean;
      upstreamStatus: number;
    };
    expect(payload.challenged).toBe(false);
    expect(payload.upstreamStatus).toBe(401);
  });

  test('a failing spike forward logs neither Cookie nor CSRF values', async () => {
    const logs: string[] = [];
    const original = { log: console.log, error: console.error, warn: console.warn };
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => logs.push(args.join(' '));
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      await handleLetterboxdWriteSpike(
        proxyRequest(SPIKE, {
          method: 'POST',
          body: '{}',
          headers: { Cookie: 'session=super-secret', 'X-CSRF-TOKEN': 'csrf-secret' },
        }),
        async () => {
          throw new Error('upstream down');
        },
      );
    } finally {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    }
    const joined = logs.join('\n');
    expect(joined).not.toContain('super-secret');
    expect(joined).not.toContain('csrf-secret');
  });
});
