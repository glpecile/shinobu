import { describe, expect, test } from 'bun:test';

import { resolveTmdbToken } from './config';

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
