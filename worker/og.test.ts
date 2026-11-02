import { expect, test } from 'bun:test';

import { cardMetaTags, parseCardPath, resolveCard, withPageMeta } from './og';

test('reads a card source only from the app routes it knows, with ids it can safely interpolate', () => {
  expect(parseCardPath('/details/tmdb/movie-603')).toEqual({ kind: 'media', provider: 'tmdb', id: 'movie-603' });
  expect(parseCardPath('/details/anilist/21/manga')).toEqual({ kind: 'media', provider: 'anilist', id: '21' });
  expect(parseCardPath('/episode/tmdb/tv-1396/1/3')).toEqual({
    kind: 'media', provider: 'tmdb', id: 'tv-1396', episode: 'Season 1 · Episode 3',
  });
  expect(parseCardPath('/episode/anilist/21/1000')).toEqual({ kind: 'media', provider: 'anilist', id: '21', episode: 'Episode 1000' });
  expect(parseCardPath('/person/anilist/95185')).toEqual({ kind: 'person', provider: 'anilist', id: '95185' });
  expect(parseCardPath('/person/lookup/Hayao%20Miyazaki')).toEqual({ kind: 'name', eyebrow: 'Person', name: 'Hayao Miyazaki' });
  expect(parseCardPath('/studio/tmdb/3')).toEqual({ kind: 'studio', id: '3' });
  expect(parseCardPath('/lists/serializd/100')).toEqual({ kind: 'serializdList', id: '100' });
  expect(parseCardPath('/lists/letterboxd/official/letterboxds-top-500-films')).toEqual({
    kind: 'letterboxdList', owner: 'official', slug: 'letterboxds-top-500-films',
  });

  for (const path of [
    '/details/tmdb/person-1',
    '/details/tmdb/movie-1%2F..%2Fconfiguration',
    '/details/bogus/1',
    '/details/simkl/1/x/y',
    '/episode/tmdb/tv-1',
    '/person/tmdb/abc',
    '/studio/lookup/%E0%A4%A',
    '/lists/letterboxd/a/../b',
    '/search',
  ]) {
    expect(parseCardPath(path)).toBeNull();
  }
});

test('escapes upstream text in the injected tags', () => {
  const tags = cardMetaTags({ title: 'A "B" <script>', description: 'x & y', posters: [] }, new URL('https://shinobu.glpecile.xyz/details/simkl/1'));
  expect(tags).toContain('<title>A &quot;B&quot; &lt;script&gt; — Shinobu</title>');
  expect(tags).toContain('<meta property="og:description" content="x &amp; y" />');
  expect(tags).toContain('<meta property="og:image" content="https://shinobu.glpecile.xyz/og/details/simkl/1.png" />');
});

test('Simkl previews use typed details for their overview and English anime title', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [type, path] of [['movie', 'movies'], ['tv', 'tv'], ['anime', 'anime']]) {
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname === '/search/id') return Response.json([{ type, title: 'Search title' }]);
        if (url.pathname === `/${path}/1` && url.searchParams.get('extended') === 'full') {
          return Response.json({ title: 'Original title', ...(type === 'anime' ? { en_title: 'English title' } : {}), overview: 'Full overview' });
        }
        return new Response(null, { status: 404 });
      }) as typeof fetch;
      const card = await resolveCard({ kind: 'media', provider: 'simkl', id: '1' }, { EXPO_PUBLIC_SIMKL_CLIENT_ID: 'test' });
      expect(card?.title).toBe(type === 'anime' ? 'English title' : 'Original title');
      expect(card?.description).toBe('Full overview');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unresolved pages get a title while preserving the site preview image', async () => {
  const cacheDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { match: async () => undefined } } });
  try {
    const response = await withPageMeta(
      new Request('https://example.test/details/trakt/1'),
      new Response('<html><head><meta property="og:image" content="/og/site.png"><meta name="description" content="Site description"></head><body>App</body></html>', { status: 404 }),
      {},
      { waitUntil() {} },
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<title>Shinobu</title>');
    expect(html).toContain('<meta property="og:title" content="Shinobu" />');
    expect(html).toContain('<meta property="og:image" content="/og/site.png">');
    expect(html).toContain('<meta name="description" content="Site description">');
  } finally {
    if (cacheDescriptor) Object.defineProperty(globalThis, 'caches', cacheDescriptor);
    else Reflect.deleteProperty(globalThis, 'caches');
  }
});
