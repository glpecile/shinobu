import { describe, expect, test } from 'bun:test';

import { mediaItemId, routes } from './routes';

describe('provider-qualified media identities', () => {
  test.each([
    ['trakt-1', '/details/trakt/1'],
    ['anilist-154587', '/details/anilist/154587'],
    ['simkl-2604475', '/details/simkl/2604475'],
    ['serializd-1396', '/details/serializd/1396'],
    ['letterboxd-heat-1995', '/details/letterboxd/heat-1995'],
    ['tmdb-movie-949', '/details/tmdb/movie-949'],
    ['tmdb-tv-1396', '/details/tmdb/tv-1396'],
    ['imdb-tt0113277', '/details/imdb/tt0113277'],
  ] as const)('%s keeps its cache identity through a resource URL', (id, expected) => {
    const path = routes.details(id);
    expect(path).toBe(expected);
    const [, , provider, resourceId] = path.split('/');
    expect(mediaItemId(provider, resourceId)).toBe(id);
  });

  test.each([
    ['unknown', '1'],
    [['anilist'], '1'],
    ['anilist', ['1']],
    ['letterboxd', '../film'],
    ['letterboxd', 'heat/1995'],
  ])('rejects invalid route identity %j/%j', (provider, id) => {
    expect(mediaItemId(provider, id)).toBeNull();
  });
});

test('typed Trakt links distinguish overlapping movie and show IDs', () => {
  expect(routes.details('trakt-1', 'MOVIE')).toBe('/details/trakt/1/movie');
  expect(routes.details('trakt-1', 'TV')).toBe('/details/trakt/1/tv');
});

describe('the watchlist route (plan 0031 R24)', () => {
  test('a provider narrows the one grid instead of opening a second screen', () => {
    // Owner, 2026-08-01: `/watchlist/letterboxd` is gone. A whole duplicate
    // screen answered a question the merged grid plus a filter answers, so the
    // Letterboxd feed row's "View all" now deep-links the filter — and the user
    // can widen it back to every provider without leaving the surface.
    expect(routes.watchlist('letterboxd')).toBe('/watchlist?provider=letterboxd');
  });
});
