import { describe, expect, it } from 'bun:test';

import { providerLinksFor } from './provider-links';

const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

describe('providerLinksFor', () => {
  it('still includes the source provider first even when disconnected', () => {
    expect(
      providerLinksFor({ id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) }, [
        'letterboxd',
      ]),
    ).toEqual([
      { provider: 'trakt', url: 'https://trakt.tv/movies/1' },
      { provider: 'letterboxd', url: 'https://letterboxd.com/film/heat/' },
    ]);
  });

  it('reads a bare provider id with no separator as that provider', () => {
    expect(providerLinksFor({ id: 'trakt', type: 'MOVIE', ...ids({ trakt: 1 }) }, [])).toEqual([
      { provider: 'trakt', url: 'https://trakt.tv/movies/1' },
    ]);
  });

  it('does not duplicate the source provider when it is also connected', () => {
    expect(
      providerLinksFor({ id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1 }) }, ['trakt']),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/movies/1' }]);
  });

  it('excludes a connected provider with no buildable URL (TV + Letterboxd)', () => {
    expect(
      providerLinksFor({ id: 'trakt-1', type: 'TV', ...ids({ trakt: 1 }) }, [
        'trakt',
        'letterboxd',
      ]),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/shows/1' }]);
  });

  it('falls back to connected-only links when the source prefix is unknown', () => {
    expect(
      providerLinksFor({ id: 'tmdb-123', type: 'MOVIE', ...ids({ trakt: 1 }) }, ['trakt']),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/movies/1' }]);
  });
});
