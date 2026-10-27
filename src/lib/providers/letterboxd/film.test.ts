import { describe, expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import { getFilmPoster, getFilmItem } from './film';

const metadata = '<script type="application/ld+json">{"@type":"Movie","name":"Beast Boy: Lone Wolf","dateCreated":"2024-10-28"}</script>';

describe('incoming Letterboxd film lookup', () => {
  test('reads the film identity from the body, not a recommendation elsewhere, and its rating', async () => {
    const rated = '<script type="application/ld+json">{"@type":"Movie","name":"Alien","aggregateRating":{"bestRating":5,"reviewCount":449170,"@type":"AggregateRating","ratingValue":4.24,"ratingCount":4553659,"worstRating":0.5}}</script>';
    const item = await Effect.runPromise(getFilmItem({
      tmdb: null,
      fetch: async (url) => {
        expect(String(url)).toBe('https://letterboxd.com/film/alien/');
        return new Response(`<body class="film backdropped" data-type="film" data-tmdb-type="movie" data-tmdb-id="348"><div data-tmdb-id="999"></div>${rated}</body>`);
      },
    }, 'alien'));
    expect(item?.id).toBe('letterboxd-alien');
    expect(item?.externalIds).toEqual({ letterboxd: 'alien', tmdb: 348 });
    expect(item?.ratings).toEqual([{ source: 'letterboxd', value: 4.24, scale: 5, votes: 4553659 }]);
  });

  test('a missing film returns a lookup miss without invalidating a session', async () => {
    expect(await Effect.runPromise(getFilmItem({ tmdb: null, fetch: async () => new Response('', { status: 404 }) }, 'missing'))).toBeNull();
  });

  test.each([
    [200, '<html>Just a moment...</html>', 'ProviderDecodeError'],
    [429, '', 'ProviderRateLimitError'],
    [500, '', 'ProviderNetworkError'],
  ] as const)('contains a failed film page with status %s', async (status, html, tag) => {
    const error = await Effect.runPromise(Effect.flip(getFilmItem({ tmdb: null, fetch: async () => new Response(html, { status }) }, 'alien')));
    expect(error._tag).toBe(tag);
  });

  test('rejects unsafe slugs before any request', async () => {
    const error = await Effect.runPromise(Effect.flip(getFilmItem({ tmdb: null, fetch: async () => { throw new Error('must not fetch'); } }, '../sign-in')));
    expect(error._tag).toBe('ProviderDecodeError');
  });

  test.each([
    [[{ id: 228880, media_type: 'tv', name: 'Beast Boy: Lone Wolf', first_air_date: '2024-10-28' }], 228880],
    [[{ id: 1, media_type: 'tv', name: 'Beast Boy: Lone Wolf', first_air_date: '2023-10-28' }], undefined],
    [[{ id: 1, media_type: 'tv', name: 'Other Show', first_air_date: '2024-10-28' }], undefined],
    [[{ id: 1, media_type: 'tv', name: 'Beast Boy: Lone Wolf', first_air_date: '2024-10-28' }, { id: 2, media_type: 'tv', name: 'Beast Boy: Lone Wolf', first_air_date: '2024-01-01' }], undefined],
  ])('TV matches require unique exact title and year: %j', async (results, expected) => {
    const item = await Effect.runPromise(getFilmItem({
      fetch: async () => new Response(`<body data-tmdb-type="movie" data-tmdb-id="">${metadata}</body>`),
      tmdb: { token: 'test', fetch: async (url) => new Response(JSON.stringify({ results: String(url).includes('/search/movie') ? [] : results })) },
    }, 'beast-boy-lone-wolf'));
    expect(item?.tmdbTvVariant).toBe(expected);
    expect(item?.externalIds).toEqual({ letterboxd: 'beast-boy-lone-wolf' });
    expect(item?.type).toBe('MOVIE');
  });

  test('an exact movie match wins without searching TV', async () => {
    const item = await Effect.runPromise(getFilmItem({
      fetch: async () => new Response(metadata),
      tmdb: { token: 'test', fetch: async (url) => {
        expect(String(url)).toContain('/search/movie');
        return new Response(JSON.stringify({ results: [{ id: 7, title: 'Beast Boy: Lone Wolf', release_date: '2024-10-28' }] }));
      } },
    }, 'beast-boy-lone-wolf'));
    expect(item?.externalIds.tmdb).toBe(7);
    expect(item?.tmdbTvVariant).toBeUndefined();
  });
});

describe('Letterboxd poster recovery', () => {
  test('uses the canonical portrait upload, not the landscape social image or guessed filename', async () => {
    const poster = 'https://a.ltrbxd.com/resized/sm/upload/3x/qu/ti/2g/nITg6iRWo3CVWJEnhV4AiD3ukfx-0-600-0-900-crop.jpg?v=d394e337a5';
    const result = await Effect.runPromise(getFilmPoster({
      fetch: async (url) => {
        expect(String(url)).toBe('https://letterboxd.com/film/onibaba/');
        return new Response(`<meta property="og:image" content="https://a.ltrbxd.com/landscape.jpg">
          <script type="application/ld+json">{"@type":"WebSite","image":"https://a.ltrbxd.com/logo.jpg"}</script>
          <script type="application/ld+json">
          /* <![CDATA[ */
          {"image":"${poster}","@type":"Movie"}
          /* ]]> */
          </script>`);
      },
    }, 'onibaba'));
    expect(result).toBe(poster);
  });

  test.each([
    '<html>No poster</html>',
    '<script type="application/ld+json">not JSON</script>',
    '<script type="application/ld+json">{"@type":"Movie","image":"https://evil.test/poster.jpg"}</script>',
  ])('unavailable or untrusted poster metadata is a recovery miss', async (html) => {
    expect(await Effect.runPromise(getFilmPoster({ fetch: async () => new Response(html) }, 'onibaba'))).toBeNull();
  });
});
