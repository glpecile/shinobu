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
      // Watchlist grant (plan 0031 R23.2 / KTD-9) — two exact-match POSTs.
      ['/api/serializd/watchlist_v2', 'POST'],
      ['/api/serializd/watchlist/remove_v2', 'POST'],
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
    for (const path of [
      '/api/serializd/login',
      // The watchlist grant is POST-only; upstream answers 405 to GET on it too
      // (plan 0031 KTD-9 evidence (C)), so the rule mirrors upstream.
      '/api/serializd/watchlist_v2',
      '/api/serializd/watchlist/remove_v2',
    ]) {
      const upstream = capturingUpstream(Response.json({}));
      const res = await handleSerializdProxy(proxyRequest(path, { method: 'GET' }), upstream.fetch);
      expect(res.status).toBe(405);
      expect(upstream.captured).toHaveLength(0);
    }
  });

  test('a POST to a GET-only path is 405', async () => {
    const upstream = capturingUpstream(Response.json({}));
    const res = await handleSerializdProxy(
      proxyRequest('/api/serializd/user/gian/diary', { method: 'POST', body: '{}' }),
      upstream.fetch,
    );
    expect(res.status).toBe(405);
  });

  /**
   * The load-bearing assertion of the watchlist grant (plan 0031 R23.2): the two
   * new rules are exact `===`, never `startsWith('watchlist')`, so every other
   * `watchlist*` shape — including `watchlist/random`, a route that really
   * exists upstream — stays a 404.
   *
   * NOTE FOR THE NEXT EDITOR: `watchlist_v2/../login` is deliberately absent and
   * must NOT be added as a 404 case. `handleSerializdProxy` derives its sub-path
   * from `new URL(request.url).pathname`, and the URL parser resolves dot
   * segments *before* the handler sees them — that request arrives as sub-path
   * `login`, matches the existing `login` POST rule, and is forwarded with a 200.
   * `isUnsafePath`'s `..` check is effectively unreachable through a normal
   * pathname; the two traversal cases below pass only because they normalize
   * *outside* the `/api/serializd/` prefix and the slice yields `''`. What keeps
   * the grant narrow is URL normalization plus exact-match rules, so the only
   * traversal shape worth asserting is the percent-encoded one, which keeps
   * `%2F` in `pathname` and therefore matches no rule (plan 0031 KTD-9).
   */
  test('unlisted paths and traversal tricks are 404, never forwarded', async () => {
    for (const path of [
      '/api/serializd/admin',
      '/api/serializd/../secret',
      '/api/serializd/user/../../etc',
      '/api/serializd/https://evil.test',
      '/api/serializd/',
      // Not a prefix grant: none of these five are allowlisted.
      '/api/serializd/watchlist/random',
      '/api/serializd/watchlist',
      '/api/serializd/watchlist/add',
      '/api/serializd/watchlist_v2/extra',
      '/api/serializd/watchlist_v2%2F..%2Flogin',
    ]) {
      for (const method of ['GET', 'POST'] as const) {
        const upstream = capturingUpstream(Response.json({}));
        const res = await handleSerializdProxy(
          proxyRequest(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) }),
          upstream.fetch,
        );
        expect(res.status).toBe(404);
        expect(upstream.captured).toHaveLength(0);
      }
    }
  });
});

describe('request hardening', () => {
  test('rejects a body over 64 KB with 413', async () => {
    for (const path of ['/api/serializd/login', '/api/serializd/watchlist_v2']) {
      const upstream = capturingUpstream(Response.json({}));
      const res = await handleSerializdProxy(
        proxyRequest(path, {
          method: 'POST',
          body: 'x'.repeat(64 * 1024 + 1),
        }),
        upstream.fetch,
      );
      expect(res.status).toBe(413);
      expect(upstream.captured).toHaveLength(0);
    }
  });

  test('forwards the app headers + Authorization only — never Cookie or other client headers', async () => {
    for (const path of [
      '/api/serializd/episode_log/add',
      // Header assembly is path-agnostic, but the watchlist grant is a widening
      // of a reviewed security contract — assert it on the new paths too
      // (plan 0031 R23.2).
      '/api/serializd/watchlist_v2',
      '/api/serializd/watchlist/remove_v2',
    ]) {
      const upstream = capturingUpstream(Response.json({ ok: true }));
      await handleSerializdProxy(
        proxyRequest(path, {
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
    }
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
    // The watchlist case is the Django HTML 404 / bare-text 500 Serializd was
    // observed answering with (plan 0031 KTD-9) — the force-JSON rule is what
    // keeps that markup off the app origin.
    for (const [path, status] of [
      ['/api/serializd/show/1396', 502],
      ['/api/serializd/watchlist_v2', 500],
    ] as const) {
      const upstream = capturingUpstream(
        new Response(`<!doctype html><h1>${status} Bad Gateway</h1>`, {
          status,
          headers: { 'content-type': 'text/html' },
        }),
      );
      const res = await handleSerializdProxy(
        proxyRequest(
          path,
          path.endsWith('watchlist_v2') ? { method: 'POST', body: '{}' } : {},
        ),
        upstream.fetch,
      );
      expect(res.status).toBe(status);
      expect(res.headers.get('content-type')).toBe('application/json');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      const text = await res.text();
      expect(text).not.toContain('<h1>');
      expect(text).toBe(JSON.stringify({ error: 'upstream error' }));
    }
  });

  test('emits no Access-Control-Allow-Origin (AE3: no CORS-bypass relay)', async () => {
    for (const path of [
      '/api/serializd/show/1396',
      '/api/serializd/watchlist_v2',
      '/api/serializd/watchlist/remove_v2',
    ]) {
      const upstream = capturingUpstream(Response.json({ ok: true }));
      const res = await handleSerializdProxy(
        proxyRequest(
          path,
          path === '/api/serializd/show/1396' ? {} : { method: 'POST', body: '{}' },
        ),
        upstream.fetch,
      );
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
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
      for (const [path, body] of [
        ['/api/serializd/login', JSON.stringify({ email: 'a@b.co', password: 'hunter2' })],
        // The watchlist body carries no secret, but the bearer token does — and
        // the grant is a widening of the no-logging invariant (plan 0031 R23.2).
        ['/api/serializd/watchlist_v2', JSON.stringify({ show_id: 1396, season_ids: [4114] })],
        ['/api/serializd/watchlist/remove_v2', JSON.stringify({ show_id: 1396, season_ids: [] })],
      ] as const) {
        await handleSerializdProxy(
          proxyRequest(path, {
            method: 'POST',
            body,
            headers: { Authorization: 'Bearer secret-tok' },
          }),
          async () => {
            throw new Error('upstream down');
          },
        );
      }
    } finally {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    }
    const joined = logs.join('\n');
    expect(joined).not.toContain('hunter2');
    expect(joined).not.toContain('secret-tok');
    expect(joined).not.toContain('4114');
  });
});
