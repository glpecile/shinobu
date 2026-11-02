import { expect, test } from 'bun:test';

import { cardMetaTags, parseCardPath } from './og';

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
