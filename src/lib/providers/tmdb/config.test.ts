import { describe, expect, test } from 'bun:test';

import { resolveTmdbToken, tmdbImageUrl } from './config';

describe('resolveTmdbToken', () => {
  // R13's contract: a build that ships a token is the maintainer's decision,
  // and a stored value must never quietly override it.
  test('the builder token wins whenever it exists', () => {
    expect(resolveTmdbToken({ builder: 'builder-token', stored: 'user-token' })).toBe(
      'builder-token',
    );
    expect(resolveTmdbToken({ builder: 'builder-token', stored: null })).toBe(
      'builder-token',
    );
  });

  test('the stored token stands in when the build ships none', () => {
    expect(resolveTmdbToken({ builder: '', stored: 'user-token' })).toBe(
      'user-token',
    );
  });

  test('clearing the stored token returns to empty — no TMDB at all', () => {
    expect(resolveTmdbToken({ builder: '', stored: null })).toBe('');
    expect(resolveTmdbToken({ builder: '', stored: '' })).toBe('');
  });
});

describe('tmdbImageUrl', () => {
  test('builds a sized URL, and stays empty without a path', () => {
    expect(tmdbImageUrl('/poster.jpg', 'w342')).toBe(
      'https://image.tmdb.org/t/p/w342/poster.jpg',
    );
    expect(tmdbImageUrl(null, 'w342')).toBe('');
    expect(tmdbImageUrl('', 'w342')).toBe('');
  });
});
