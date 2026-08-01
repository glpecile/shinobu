import { describe, expect, it } from 'bun:test';

import {
  letterboxdPersonSlug,
  providerHomeUrl,
  providerItemUrl,
  providerPersonUrl,
} from './external-urls';

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

  // Plan 0034 U1: Simkl pages are shape-keyed by the simkl id — /tv, /movies,
  // and /anime sections — with the documented id-redirect as the tmdb fallback
  // (the same missing-id degradation shape as Trakt's search redirect).
  it('builds a Simkl TV URL from a simkl id', () => {
    expect(providerItemUrl('simkl', { type: 'TV', ...ids({ simkl: 111 }) })).toBe(
      'https://simkl.com/tv/111',
    );
  });

  it('builds a Simkl movie URL from a simkl id', () => {
    expect(providerItemUrl('simkl', { type: 'MOVIE', ...ids({ simkl: 222 }) })).toBe(
      'https://simkl.com/movies/222',
    );
  });

  it('routes anime — series and films alike — to the Simkl anime section', () => {
    expect(providerItemUrl('simkl', { type: 'ANIME', ...ids({ simkl: 333 }) })).toBe(
      'https://simkl.com/anime/333',
    );
    expect(
      providerItemUrl('simkl', { type: 'ANIME', isFilm: true, ...ids({ simkl: 333 }) }),
    ).toBe('https://simkl.com/anime/333');
  });

  it('falls back to the tmdb redirect for Simkl when no simkl id exists', () => {
    expect(providerItemUrl('simkl', { type: 'TV', ...ids({ tmdb: 456 }) })).toBe(
      'https://api.simkl.com/redirect?tmdb=456&type=show',
    );
    expect(providerItemUrl('simkl', { type: 'MOVIE', ...ids({ tmdb: 456 }) })).toBe(
      'https://api.simkl.com/redirect?tmdb=456&type=movie',
    );
    expect(providerItemUrl('simkl', { type: 'ANIME', ...ids({ tmdb: 456 }) })).toBe(
      'https://api.simkl.com/redirect?tmdb=456&type=anime',
    );
  });

  it('returns null for Simkl on MANGA or with no usable id', () => {
    expect(
      providerItemUrl('simkl', { type: 'MANGA', ...ids({ simkl: 1, tmdb: 2 }) }),
    ).toBeNull();
    expect(providerItemUrl('simkl', { type: 'TV', ...ids({ trakt: 1 }) })).toBeNull();
    expect(providerItemUrl('simkl', { type: 'TV', ...ids() })).toBeNull();
  });
});

describe('letterboxdPersonSlug', () => {
  it('lowercases and hyphenates a plain name', () => {
    expect(letterboxdPersonSlug('Greta Gerwig')).toBe('greta-gerwig');
  });

  it('strips diacritics onto their base letter', () => {
    expect(letterboxdPersonSlug('Joaquín Phoenix')).toBe('joaquin-phoenix');
    expect(letterboxdPersonSlug('Chloë Sevigny')).toBe('chloe-sevigny');
    expect(letterboxdPersonSlug("Lupita Nyong'o")).toBe('lupita-nyong-o');
  });

  it('collapses apostrophes and periods into single hyphens', () => {
    expect(letterboxdPersonSlug("Conan O'Brien")).toBe('conan-o-brien');
    expect(letterboxdPersonSlug('Robert Downey Jr.')).toBe('robert-downey-jr');
    expect(letterboxdPersonSlug('J.K. Simmons')).toBe('j-k-simmons');
  });

  it('collapses middle dots and interpunct-style separators', () => {
    expect(letterboxdPersonSlug('WALL·E Doe')).toBe('wall-e-doe');
    expect(letterboxdPersonSlug('Jean-Luc  Godard')).toBe('jean-luc-godard');
  });

  it('collapses runs of whitespace and trims stray hyphens', () => {
    expect(letterboxdPersonSlug('  Bong   Joon Ho  ')).toBe('bong-joon-ho');
    expect(letterboxdPersonSlug('-Wes Anderson-')).toBe('wes-anderson');
  });

  it('returns an empty slug for a name with no latin alphanumerics', () => {
    expect(letterboxdPersonSlug('宮崎 駿')).toBe('');
    expect(letterboxdPersonSlug('新海誠')).toBe('');
    expect(letterboxdPersonSlug('   ')).toBe('');
  });

  it('keeps digits', () => {
    expect(letterboxdPersonSlug('Travis Scott 2')).toBe('travis-scott-2');
  });
});

describe('providerPersonUrl', () => {
  it('maps each known TMDB department to its Letterboxd role segment', () => {
    const cases: [string, string][] = [
      ['Acting', 'actor'],
      ['Directing', 'director'],
      ['Writing', 'writer'],
      ['Production', 'producer'],
      ['Sound', 'composer'],
      ['Editing', 'editor'],
      ['Camera', 'cinematography'],
    ];
    for (const [department, role] of cases) {
      expect(
        providerPersonUrl('letterboxd', {
          name: 'Ada Lovelace',
          knownForDepartment: department,
        }),
      ).toBe(`https://letterboxd.com/${role}/ada-lovelace/`);
    }
  });

  it('defaults to the actor role for a missing or unmapped department', () => {
    expect(providerPersonUrl('letterboxd', { name: 'Ada Lovelace' })).toBe(
      'https://letterboxd.com/actor/ada-lovelace/',
    );
    expect(
      providerPersonUrl('letterboxd', {
        name: 'Ada Lovelace',
        knownForDepartment: 'Visual Effects',
      }),
    ).toBe('https://letterboxd.com/actor/ada-lovelace/');
  });

  it('matches the department case-insensitively', () => {
    expect(
      providerPersonUrl('letterboxd', {
        name: 'Ada Lovelace',
        knownForDepartment: ' directing ',
      }),
    ).toBe('https://letterboxd.com/director/ada-lovelace/');
  });

  it('returns null for Letterboxd when the name yields no slug', () => {
    expect(
      providerPersonUrl('letterboxd', { name: '宮崎 駿', knownForDepartment: 'Directing' }),
    ).toBeNull();
  });

  it('builds an AniList staff search URL', () => {
    expect(providerPersonUrl('anilist', { name: 'Hayao Miyazaki' })).toBe(
      'https://anilist.co/search/staff?search=Hayao%20Miyazaki',
    );
  });

  it('percent-encodes and preserves non-latin names for the AniList search', () => {
    expect(providerPersonUrl('anilist', { name: '宮崎 駿' })).toBe(
      'https://anilist.co/search/staff?search=%E5%AE%AE%E5%B4%8E%20%E9%A7%BF',
    );
    expect(providerPersonUrl('anilist', { name: "Conan O'Brien" })).toBe(
      "https://anilist.co/search/staff?search=Conan%20O'Brien",
    );
  });

  it('returns null for AniList on a blank name', () => {
    expect(providerPersonUrl('anilist', { name: '   ' })).toBeNull();
  });

  it('returns null for Trakt, Serializd and Simkl (no addressable person surface)', () => {
    expect(providerPersonUrl('trakt', { name: 'Ada Lovelace' })).toBeNull();
    expect(providerPersonUrl('serializd', { name: 'Ada Lovelace' })).toBeNull();
    expect(providerPersonUrl('simkl', { name: 'Ada Lovelace' })).toBeNull();
  });
});

describe('providerHomeUrl', () => {
  it('returns each provider log surface root', () => {
    expect(providerHomeUrl('trakt')).toBe('https://trakt.tv');
    expect(providerHomeUrl('anilist')).toBe('https://anilist.co');
    expect(providerHomeUrl('letterboxd')).toBe('https://letterboxd.com');
    expect(providerHomeUrl('serializd')).toBe('https://serializd.com');
    expect(providerHomeUrl('simkl')).toBe('https://simkl.com');
  });
});
