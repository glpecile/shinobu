import { expect, test } from 'bun:test';

import { handleRedditProxy } from './reddit-proxy';

const ORIGIN = 'https://shinobu.glpecile.xyz';
const FEED = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>';

test('relays the three subreddit search feeds with fixed parameters and no client credentials', async () => {
  for (const subreddit of ['anime', 'movies', 'television']) {
    const response = await handleRedditProxy(new Request(`${ORIGIN}/api/reddit/${subreddit}/search.rss?q=Sousou%20no%20Frieren`, {
      headers: { Authorization: 'Bearer secret', Cookie: 'reddit_session=secret', 'User-Agent': 'caller' },
    }), async (url, init) => {
      expect(url).toBe(`https://www.reddit.com/r/${subreddit}/search.rss?q=Sousou%20no%20Frieren&restrict_sr=on&sort=new&limit=25`);
      expect(init?.method).toBe('GET');
      expect(init?.headers).toEqual({ 'User-Agent': 'web:shinobu:1.0 (discussion search)' });
      expect(init?.redirect).toBe('manual');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(FEED, { headers: {
        'Content-Type': 'application/atom+xml; charset=UTF-8', 'Set-Cookie': 'secret=1', 'Access-Control-Allow-Origin': '*',
      } });
    });
    expect(await response.text()).toBe(FEED);
    expect(response.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  }
});

test('rejects other paths, parameters and methods before contacting upstream', async () => {
  for (const [path, method, status] of [
    ['/api/reddit/anime/search.rss?q=frieren', 'POST', 405],
    ['/api/reddit/anime/search.rss?q=frieren', 'OPTIONS', 405],
    ['/api/reddit/anime/search.rss', 'GET', 404],
    ['/api/reddit/anime/search.rss?q=', 'GET', 404],
    [`/api/reddit/anime/search.rss?q=${'a'.repeat(201)}`, 'GET', 404],
    ['/api/reddit/anime/search.rss?q=frieren&restrict_sr=off', 'GET', 404],
    ['/api/reddit/anime/search.rss?q=a&q=b', 'GET', 404],
    ['/api/reddit/pics/search.rss?q=frieren', 'GET', 404],
    ['/api/reddit/anime/search.json?q=frieren', 'GET', 404],
    ['/api/reddit/anime/comments/1xl3wj1.rss', 'GET', 404],
    ['/api/reddit/anime/../pics/search.rss?q=frieren', 'GET', 404],
  ] as const) {
    let calls = 0;
    const response = await handleRedditProxy(new Request(`${ORIGIN}${path}`, { method }), async () => {
      calls++;
      return new Response(FEED, { headers: { 'Content-Type': 'application/atom+xml' } });
    });
    expect(response.status).toBe(status);
    expect(calls).toBe(0);
  }
});

test('rate limits, redirects, block pages and non-feeds are clean non-cacheable errors', async () => {
  for (const [upstream, status] of [
    [new Response('', { status: 429 }), 502],
    [new Response('', { status: 302, headers: { Location: 'https://www.reddit.com/login' } }), 502],
    [new Response('<body>blocked</body>', { headers: { 'Content-Type': 'text/html' } }), 502],
    [new Response('<html></html>', { headers: { 'Content-Type': 'application/atom+xml' } }), 502],
    [null, 504],
  ] as const) {
    const response = await handleRedditProxy(new Request(`${ORIGIN}/api/reddit/movies/search.rss?q=dune`), async () => {
      if (upstream == null) throw new Error('network unavailable');
      return upstream;
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
});
