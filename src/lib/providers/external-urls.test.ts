import { describe, expect, it } from 'bun:test';

import { providerHomeUrl, providerItemUrl } from './external-urls';

const ids = (externalIds: Record<string, number | string> = {}) => ({ externalIds });

describe('providerItemUrl', () => {
  it('builds a Trakt movie URL from a trakt id', () => {
    expect(
      providerItemUrl('trakt', { type: 'MOVIE', ...ids({ trakt: 123 }) }),
    ).toBe('https://trakt.tv/movies/123');
  });

  it('builds a Trakt search-redirect URL for a show with only a tmdb id', () => {
    expect(
      providerItemUrl('trakt', { type: 'TV', ...ids({ tmdb: 456 }) }),
    ).toBe('https://trakt.tv/search/tmdb/456?id_type=show');
  });

  it('builds an AniList manga URL', () => {
    expect(
      providerItemUrl('anilist', { type: 'MANGA', ...ids({ anilist: 789 }) }),
    ).toBe('https://anilist.co/manga/789');
  });

  it('builds a Letterboxd URL from a slug', () => {
    expect(
      providerItemUrl('letterboxd', {
        type: 'MOVIE',
        ...ids({ letterboxd: 'fight-club' }),
      }),
    ).toBe('https://letterboxd.com/film/fight-club/');
  });

  it('falls back to the tmdb redirect for an anime film with no letterboxd slug', () => {
    expect(
      providerItemUrl('letterboxd', {
        type: 'ANIME',
        isFilm: true,
        ...ids({ tmdb: 321 }),
      }),
    ).toBe('https://letterboxd.com/tmdb/321');
  });

  it('returns null for Letterboxd on a TV item (movies only)', () => {
    expect(
      providerItemUrl('letterboxd', {
        type: 'TV',
        ...ids({ letterboxd: 'not-a-film', tmdb: 1 }),
      }),
    ).toBeNull();
  });

  it('returns null for Serializd without a tmdb id', () => {
    expect(providerItemUrl('serializd', { type: 'TV', ...ids({ trakt: 1 }) })).toBeNull();
  });

  it('builds a Serializd URL from a tmdb id', () => {
    expect(
      providerItemUrl('serializd', { type: 'TV', ...ids({ tmdb: 654 }) }),
    ).toBe('https://serializd.com/show/654');
  });

  it('returns null for every provider with empty externalIds', () => {
    expect(providerItemUrl('trakt', { type: 'MOVIE', ...ids() })).toBeNull();
    expect(providerItemUrl('anilist', { type: 'ANIME', ...ids() })).toBeNull();
    expect(providerItemUrl('letterboxd', { type: 'MOVIE', ...ids() })).toBeNull();
    expect(providerItemUrl('serializd', { type: 'TV', ...ids() })).toBeNull();
  });

  it('routes an anime film to a movie-shaped Trakt URL', () => {
    expect(
      providerItemUrl('trakt', { type: 'ANIME', isFilm: true, ...ids({ trakt: 111 }) }),
    ).toBe('https://trakt.tv/movies/111');
  });

  it('routes an anime series to a show-shaped Trakt URL', () => {
    expect(
      providerItemUrl('trakt', { type: 'ANIME', ...ids({ trakt: 222 }) }),
    ).toBe('https://trakt.tv/shows/222');
  });

  it('builds an AniList anime URL (non-manga branch)', () => {
    expect(
      providerItemUrl('anilist', { type: 'ANIME', ...ids({ anilist: 555 }) }),
    ).toBe('https://anilist.co/anime/555');
  });
});

describe('providerHomeUrl', () => {
  it('returns each provider log surface root', () => {
    expect(providerHomeUrl('trakt')).toBe('https://trakt.tv');
    expect(providerHomeUrl('anilist')).toBe('https://anilist.co');
    expect(providerHomeUrl('letterboxd')).toBe('https://letterboxd.com');
    expect(providerHomeUrl('serializd')).toBe('https://serializd.com');
  });
});
