import { expect, test } from 'bun:test';

import { handleFourchanProxy } from './fourchan-proxy';

const ORIGIN = 'https://shinobu.glpecile.xyz';

test('relays only the three public catalogs without client credentials or upstream headers', async () => {
  for (const board of ['a', 'tv', 'co']) {
    const response = await handleFourchanProxy(new Request(`${ORIGIN}/api/fourchan/${board}/catalog.json`, {
      headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', 'X-Evil': 'nope' },
    }), async (url, init) => {
      expect(url).toBe(`https://api.4chan.org/${board}/catalog.json`);
      expect(init?.method).toBe('GET');
      expect(init?.headers).toBeUndefined();
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json([{ threads: [{ no: 291481805 }] }], { headers: {
        'Set-Cookie': 'secret=1', 'Access-Control-Allow-Origin': '*',
      } });
    });
    expect(await response.json()).toEqual([{ threads: [{ no: 291481805 }] }]);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  }
});

test('rejects other paths, queries and methods before contacting upstream', async () => {
  for (const [path, method, status] of [
    ['/api/fourchan/a/catalog.json', 'POST', 405],
    ['/api/fourchan/a/catalog.json', 'HEAD', 405],
    ['/api/fourchan/a/catalog.json', 'OPTIONS', 405],
    ['/api/fourchan/a/catalog.json?url=https://evil.test', 'GET', 404],
    ['/api/fourchan/b/catalog.json', 'GET', 404],
    ['/api/fourchan/a/thread/291481805.json', 'GET', 404],
    ['/api/fourchan/a/archive.json', 'GET', 404],
    ['/api/fourchan/a/catalog.json/extra', 'GET', 404],
    ['/api/fourchan/%61/catalog.json', 'GET', 404],
    ['/api/fourchan/a/../../tv/catalog.json', 'GET', 404],
    ['/api/fourchan/https://evil.test/catalog.json', 'GET', 404],
  ] as const) {
    let calls = 0;
    const response = await handleFourchanProxy(new Request(`${ORIGIN}${path}`, { method }), async () => {
      calls++;
      return Response.json([]);
    });
    expect(response.status).toBe(status);
    expect(calls).toBe(0);
  }
});

test('upstream failures, redirects, HTML and invalid JSON are clean non-cacheable errors', async () => {
  for (const [upstream, status] of [
    [Response.json({ error: 'unavailable' }, { status: 503 }), 502],
    [new Response('', { status: 302, headers: { Location: 'https://evil.test' } }), 502],
    [new Response('<script>bad()</script>', { headers: { 'Content-Type': 'text/html' } }), 502],
    [new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }), 502],
    [null, 504],
  ] as const) {
    const response = await handleFourchanProxy(new Request(`${ORIGIN}/api/fourchan/co/catalog.json`), async () => {
      if (upstream == null) throw new Error('network unavailable');
      return upstream;
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toHaveProperty('error');
  }
});
