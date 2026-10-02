import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { getFilmTmdbId } from './film';

describe('incoming Letterboxd film lookup', () => {
  test('reads the film identity from the body, not a recommendation elsewhere', async () => {
    const id = await Effect.runPromise(getFilmTmdbId({
      fetch: async (url) => {
        expect(String(url)).toBe('https://letterboxd.com/film/alien/');
        return new Response('<body class="film backdropped" data-type="film" data-tmdb-type="movie" data-tmdb-id="348"><div data-tmdb-id="999"></div></body>');
      },
    }, 'alien'));
    expect(id).toBe(348);
  });

  test('a missing film returns a lookup miss without invalidating a session', async () => {
    expect(await Effect.runPromise(getFilmTmdbId({ fetch: async () => new Response('', { status: 404 }) }, 'missing'))).toBeNull();
  });

  test.each([
    [200, '<html>Just a moment...</html>', 'ProviderDecodeError'],
    [429, '', 'ProviderRateLimitError'],
    [500, '', 'ProviderNetworkError'],
  ] as const)('contains a failed film page with status %s', async (status, html, tag) => {
    const error = await Effect.runPromise(Effect.flip(getFilmTmdbId({ fetch: async () => new Response(html, { status }) }, 'alien')));
    expect(error._tag).toBe(tag);
  });

  test('rejects unsafe slugs before any request', async () => {
    const error = await Effect.runPromise(Effect.flip(getFilmTmdbId({ fetch: async () => { throw new Error('must not fetch'); } }, '../sign-in')));
    expect(error._tag).toBe('ProviderDecodeError');
  });
});
