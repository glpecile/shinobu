import { describe, expect, it } from 'bun:test';

import { providerLinksFor, sourceLinkFor, sourceProviderOf } from './provider-links';

const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

describe('sourceProviderOf', () => {
  it('parses the provider prefix from the id', () => {
    expect(sourceProviderOf({ id: 'trakt-12345' })).toBe('trakt');
    expect(sourceProviderOf({ id: 'letterboxd-fight-club' })).toBe('letterboxd');
  });

  it('returns null for an unknown prefix', () => {
    expect(sourceProviderOf({ id: 'tmdb-123' })).toBeNull();
  });

  it('returns null for an id with no separator at all', () => {
    expect(sourceProviderOf({ id: 'nope' })).toBeNull();
  });

  it('treats a bare id matching a provider id as that provider (no separator needed)', () => {
    expect(sourceProviderOf({ id: 'trakt' })).toBe('trakt');
  });
});

describe('sourceLinkFor', () => {
  it('returns the source provider link when buildable', () => {
    expect(
      sourceLinkFor({ id: 'trakt-1', type: 'MOVIE', ...ids({ trakt: 1 }) }),
    ).toEqual({ provider: 'trakt', url: 'https://trakt.tv/movies/1' });
  });

  it('returns undefined — never a substitute — when the source URL is not buildable', () => {
    // Source is Letterboxd but the item is a TV show (Letterboxd is movies-only,
    // so its own URL can't be built) — this must not fall back to some other
    // provider's link even if one happens to be buildable.
    expect(
      sourceLinkFor({ id: 'letterboxd-not-a-film', type: 'TV', ...ids({ trakt: 1 }) }),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown source prefix', () => {
    expect(
      sourceLinkFor({ id: 'tmdb-123', type: 'MOVIE', ...ids({ trakt: 1 }) }),
    ).toBeUndefined();
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
