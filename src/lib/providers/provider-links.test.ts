import { describe, expect, it } from 'bun:test';

import { providerLinksFor, sourceProviderOf } from './provider-links';

const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

describe('sourceProviderOf', () => {
  it('parses the provider prefix from the id', () => {
    expect(sourceProviderOf({ id: 'trakt-12345' })).toBe('trakt');
    expect(sourceProviderOf({ id: 'letterboxd-fight-club' })).toBe('letterboxd');
  });

  it('returns null for an unknown prefix', () => {
    expect(sourceProviderOf({ id: 'tmdb-123' })).toBeNull();
  });
});

describe('providerLinksFor', () => {
  it('orders the source provider first, then connected providers', () => {
    expect(
      providerLinksFor(
        { id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['trakt', 'letterboxd'],
      ),
    ).toEqual([
      { provider: 'trakt', url: 'https://trakt.tv/movies/1' },
      { provider: 'letterboxd', url: 'https://letterboxd.com/film/heat/' },
    ]);
  });

  it('still includes the source provider first even when disconnected', () => {
    expect(
      providerLinksFor(
        { id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1, letterboxd: 'heat' }) },
        ['letterboxd'],
      ),
    ).toEqual([
      { provider: 'trakt', url: 'https://trakt.tv/movies/1' },
      { provider: 'letterboxd', url: 'https://letterboxd.com/film/heat/' },
    ]);
  });

  it('does not duplicate the source provider when it is also connected', () => {
    expect(
      providerLinksFor({ id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1 }) }, ['trakt']),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/movies/1' }]);
  });

  it('excludes a connected provider with no buildable URL (TV + Letterboxd)', () => {
    expect(
      providerLinksFor(
        { id: 'trakt-1', type: 'TV', ...ids({ trakt: 1 }) },
        ['trakt', 'letterboxd'],
      ),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/shows/1' }]);
  });

  it('falls back to connected-only links when the source prefix is unknown', () => {
    expect(
      providerLinksFor(
        { id: 'tmdb-123', type: 'MOVIE', ...ids({ trakt: 1 }) },
        ['trakt'],
      ),
    ).toEqual([{ provider: 'trakt', url: 'https://trakt.tv/movies/1' }]);
  });

  it('returns an empty array with no buildable URLs and an unknown source', () => {
    expect(
      providerLinksFor({ id: 'tmdb-123', type: 'MOVIE', ...ids() }, ['trakt']),
    ).toEqual([]);
  });

  it('includes both movie-shaped URLs for an anime film', () => {
    expect(
      providerLinksFor(
        {
          id: 'anilist-1',
          type: 'ANIME',
          isFilm: true,
          ...ids({ anilist: 1, trakt: 2, letterboxd: 'your-name' }),
        },
        ['trakt', 'letterboxd'],
      ),
    ).toEqual([
      { provider: 'anilist', url: 'https://anilist.co/anime/1' },
      { provider: 'trakt', url: 'https://trakt.tv/movies/2' },
      { provider: 'letterboxd', url: 'https://letterboxd.com/film/your-name/' },
    ]);
  });
});
