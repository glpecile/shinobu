import { describe, expect, test } from 'bun:test';

import { redirectSystemPath } from '@/app/+native-intent';

describe('incoming media links', () => {
  test.each([
    ['https://letterboxd.com/film/alien/?from=share#crew', '/details/letterboxd/alien'],
    ['https://www.imdb.com/title/tt0078748/?ref_=share', '/details/imdb/tt0078748'],
    ['https://m.imdb.com/title/tt0078748', '/details/imdb/tt0078748'],
    ['https://anilist.co/anime/1/Cowboy-Bebop/', '/details/anilist/1'],
    ['https://anilist.co/manga/30002', '/details/anilist/30002/manga'],
    ['shinobu://open?url=https%3A%2F%2Fletterboxd.com%2Ffilm%2Falien%2F', '/details/letterboxd/alien'],
  ])('%s opens its exact media item', (path, expected) => {
    for (const initial of [true, false]) {
      expect(redirectSystemPath({ path, initial })).toBe(expected);
    }
  });

  test.each([
    'https://letterboxd.com.evil.example/film/alien/',
    'https://letterboxd.com@evil.example/film/alien/',
    'https://evil.example@letterboxd.com/film/alien/',
    'https://letterboxd.com/film/alien/json/',
    'https://letterboxd.com/gian/film/alien/',
    'https://imdb.com/name/nm0000001/',
    'https://anilist.co/user/1/',
    'https://anilist.co/anime/9007199254740993',
    'shinobu://open?url=javascript%3Aalert(1)',
    'shinobu://open?url=not-a-url',
  ])('rejects unsupported or unsafe input %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
  });

  test.each([
    '/details/tmdb-movie-348',
    '/details/tmdb/movie-348',
    'shinobu://details/anilist-1',
    'shinobu://details/anilist/1',
    'shinobu://redirect?code=abc&state=xyz',
    'shinobu://redirect#access_token=abc',
    'exp://localhost:8081/--/details/anilist-1',
  ])('preserves existing routes and auth callbacks %s', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
