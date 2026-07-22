import { describe, expect, test } from 'bun:test';

import { handleSerializdProxy, isSerializdProxyRequest } from './serializd-proxy';

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

function proxyRequest(
  path: string,
  init: RequestInit = {},
): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

describe('isSerializdProxyRequest', () => {
  test('matches the /api/serializd/ prefix only', () => {
    expect(isSerializdProxyRequest(new URL(`${ORIGIN}/api/serializd/show/1396`))).toBe(true);
    expect(isSerializdProxyRequest(new URL(`${ORIGIN}/api/other`))).toBe(false);
    expect(isSerializdProxyRequest(new URL(`${ORIGIN}/`))).toBe(false);
  });
});

describe('allowlist', () => {
  test('passes allowlisted path+method pairs through to upstream', async () => {
    for (const [path, method] of [
      ['/api/serializd/user/gian/diary', 'GET'],
      ['/api/serializd/login', 'POST'],
      ['/api/serializd/episode_log/add', 'POST'],
      ['/api/serializd/show/reviews/add', 'POST'],
    ] as const) {
      const upstream = capturingUpstream(Response.json({ ok: true }));
      const res = await handleSerializdProxy(
        proxyRequest(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) }),
        upstream.fetch,
      );
      expect(res.status).toBe(200);
      expect(upstream.captured).toHaveLength(1);
    }
  });

  test('a wrong method on an allowlisted path is 405', async () => {
    const upstream = capturingUpstream(Response.json({}));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/login', { method: 'GET' }),
      upstream.fetch,
    );
    expect(res.status).toBe(405);
    expect(upstream.captured).toHaveLength(0);
  });

  test('a POST to a GET-only path is 405', async () => {
    const upstream = capturingUpstream(Response.json({}));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/user/gian/diary', { method: 'POST', body: '{}' }),
      upstream.fetch,
    );
    expect(res.status).toBe(405);
  });

  test('unlisted paths and traversal tricks are 404, never forwarded', async () => {
    for (const path of [
      '/api/serializd/admin',
      '/api/serializd/../secret',
      '/api/serializd/user/../../etc',
      '/api/serializd/https://evil.test',
      '/api/serializd/',
    ]) {
      const upstream = capturingUpstream(Response.json({}));
      const res = await handleSerializdProxy(proxyRequest(path), upstream.fetch);
      expect(res.status).toBe(404);
      expect(upstream.captured).toHaveLength(0);
    }
  });
});

describe('request hardening', () => {
  test('rejects a body over 64 KB with 413', async () => {
    const upstream = capturingUpstream(Response.json({}));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/login', {
        method: 'POST',
        body: 'x'.repeat(64 * 1024 + 1),
      }),
      upstream.fetch,
    );
    expect(res.status).toBe(413);
    expect(upstream.captured).toHaveLength(0);
  });

  test('forwards the app headers + Authorization only — never Cookie or other client headers', async () => {
    const upstream = capturingUpstream(Response.json({ ok: true }));
    await handleSerializdProxy(
      proxyRequest('/api/serializd/episode_log/add', {
        method: 'POST',
        body: '{}',
        headers: {
          Authorization: 'Bearer tok-123',
          Cookie: 'session=secret',
          'X-Evil': 'nope',
        },
      }),
      upstream.fetch,
    );
    const headers = upstream.captured[0].init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      Origin: 'https://www.serializd.com',
      Referer: 'https://www.serializd.com',
      'X-Requested-With': 'serializd_vercel',
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123',
    });
    expect(headers.Cookie).toBeUndefined();
    expect(headers['X-Evil']).toBeUndefined();
  });

  test('forwards to the upstream host + preserves the query string', async () => {
    const upstream = capturingUpstream(Response.json({}));
    await handleSerializdProxy(
      proxyRequest('/api/serializd/user/gian/diary?page=3'),
      upstream.fetch,
    );
    expect(upstream.captured[0].url).toBe(
      'https://serializd.onrender.com/api/user/gian/diary?page=3',
    );
  });
});

describe('response relay', () => {
  test('passes the upstream status through (401 stays 401)', async () => {
    const upstream = capturingUpstream(Response.json({ error: 'bad token' }, { status: 401 }));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/episode_log/add', { method: 'POST', body: '{}' }),
      upstream.fetch,
    );
    expect(res.status).toBe(401);
  });

  test('never relays an HTML upstream body verbatim — forces JSON + nosniff', async () => {
    const html = new Response('<!doctype html><h1>502 Bad Gateway</h1>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });
    const upstream = capturingUpstream(html);
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/show/1396'),
      upstream.fetch,
    );
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const text = await res.text();
    expect(text).not.toContain('<h1>');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('emits no Access-Control-Allow-Origin (AE3: no CORS-bypass relay)', async () => {
    const upstream = capturingUpstream(Response.json({ ok: true }));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/show/1396'),
      upstream.fetch,
    );
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('an upstream timeout maps to 504', async () => {
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/login', { method: 'POST', body: '{}' }),
      async () => {
        throw new Error('timed out');
      },
    );
    expect(res.status).toBe(504);
  });
});

describe('no secret logging', () => {
  test('a failing /login forward logs neither the request body nor Authorization', async () => {
    const logs: string[] = [];
    const original = { log: console.log, error: console.error, warn: console.warn };
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => logs.push(args.join(' '));
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      await handleSerializdProxy(
        proxyRequest('/api/serializd/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.co', password: 'hunter2' }),
          headers: { Authorization: 'Bearer secret-tok' },
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
    expect(joined).not.toContain('hunter2');
    expect(joined).not.toContain('secret-tok');
  });
});
