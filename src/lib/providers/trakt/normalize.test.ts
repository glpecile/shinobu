import { describe, expect, test } from 'bun:test';

import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeSearchResult,
  normalizeStudio,
  normalizeWatchedMovie,
  type TraktCastEntry,
  type TraktCrewEntry,
  type TraktMovie,
  type TraktShow,
  type TraktWatchedMovie,
} from './normalize';

function person(id: number, name: string, headshot?: string) {
  return {
    name,
    ids: { trakt: id },
    ...(headshot != null ? { images: { headshot: [headshot] } } : {}),
  };
}

describe('normalizeCastEntry', () => {
  test('joins multiple characters and prefixes scheme-less headshots', () => {
    const entry: TraktCastEntry = {
      characters: ['Sherlock Holmes', 'Narrator'],
      person: person(42, 'Henry Cavill', 'walter.trakt.tv/people/42/headshot.jpg'),
    };

    expect(normalizeCastEntry(entry)).toEqual({
      id: 'trakt-person-42',
      name: 'Henry Cavill',
      character: 'Sherlock Holmes, Narrator',
      headshot: 'https://walter.trakt.tv/people/42/headshot.jpg',
    });
  });

  test('falls back to legacy singular `character` and empty headshot', () => {
    const entry: TraktCastEntry = {
      character: 'Enola',
      person: person(7, 'Millie Bobby Brown'),
    };

    const normalized = normalizeCastEntry(entry);
    expect(normalized.character).toBe('Enola');
    expect(normalized.headshot).toBe('');
  });
});

describe('normalizeCrew', () => {
  const director: TraktCrewEntry = {
    jobs: ['Director'],
    person: person(1, 'Harry Bradbeer'),
  };

  test('returns [] when crew is missing', () => {
    expect(normalizeCrew(undefined)).toEqual([]);
  });

  test('orders departments by billing, unknown departments last', () => {
    const crew = normalizeCrew({
      'made-up-department': [
        { jobs: ['Wrangler'], person: person(3, 'Zed Last') },
      ],
      editing: [{ jobs: ['Editor'], person: person(2, 'Adam Bosman') }],
      directing: [director],
    });

    expect(crew.map((member) => member.name)).toEqual([
      'Harry Bradbeer',
      'Adam Bosman',
      'Zed Last',
    ]);
  });

  test('merges one person credited across departments into a single entry', () => {
    const crew = normalizeCrew({
      directing: [director],
      writing: [
        { jobs: ['Writer', 'Director'], person: person(1, 'Harry Bradbeer') },
      ],
    });

    expect(crew).toHaveLength(1);
    expect(crew[0].job).toBe('Director, Writer');
  });

  test('supports legacy singular `job`', () => {
    const crew = normalizeCrew({
      camera: [{ job: 'Director of Photography', person: person(9, 'Giles Nuttgens') }],
    });

    expect(crew[0].job).toBe('Director of Photography');
  });
});

describe('normalizeSearchResult', () => {
  const NOW = '2026-07-10T12:00:00.000Z';

  const movie: TraktMovie = {
    title: 'Perfect Blue',
    year: 1997,
    ids: { trakt: 100, tmdb: 10494 },
    images: { poster: ['walter.trakt.tv/movies/100/poster.jpg'] },
  };

  const show: TraktShow = {
    title: 'Monogatari',
    year: 2009,
    ids: { trakt: 200, tmdb: 46004 },
    aired_episodes: 15,
  };

  test('a movie row normalizes as MOVIE with the supplied instant', () => {
    const normalized = normalizeSearchResult({ type: 'movie', movie }, NOW);

    expect(normalized).toMatchObject({
      id: 'trakt-100',
      title: 'Perfect Blue',
      type: 'MOVIE',
      year: 1997,
      coverImage: 'https://walter.trakt.tv/movies/100/poster.jpg',
      lastUpdated: NOW,
      externalIds: { trakt: 100, tmdb: 10494 },
    });
  });

  test('a show row normalizes as TV and carries aired episodes', () => {
    const normalized = normalizeSearchResult({ type: 'show', show }, NOW);

    expect(normalized).toMatchObject({
      id: 'trakt-200',
      type: 'TV',
      totalEpisodes: 15,
      externalIds: { trakt: 200, tmdb: 46004 },
    });
  });

  test('row kinds we do not handle drop out as null instead of throwing', () => {
    expect(normalizeSearchResult({ type: 'episode' }, NOW)).toBeNull();
    expect(normalizeSearchResult({ type: 'person' }, NOW)).toBeNull();
  });

  test('a row whose declared type is missing its payload drops out', () => {
    expect(normalizeSearchResult({ type: 'movie' }, NOW)).toBeNull();
    expect(normalizeSearchResult({ type: 'show', movie }, NOW)).toBeNull();
  });
});

describe('normalizeWatchedMovie', () => {
  const watched: TraktWatchedMovie = {
    plays: 3,
    last_watched_at: '2026-07-01T21:30:00.000Z',
    last_updated_at: '2026-07-02T08:00:00.000Z',
    movie: {
      title: 'Perfect Blue',
      year: 1997,
      ids: { trakt: 100, tmdb: 10494 },
      images: { poster: ['walter.trakt.tv/movies/100/poster.jpg'] },
    },
  };

  test('plays becomes currentProgress and last_watched_at becomes lastUpdated', () => {
    expect(normalizeWatchedMovie(watched)).toMatchObject({
      id: 'trakt-100',
      title: 'Perfect Blue',
      type: 'MOVIE',
      currentProgress: 3,
      lastUpdated: '2026-07-01T21:30:00.000Z',
      externalIds: { trakt: 100, tmdb: 10494 },
    });
  });

  test('prefixes scheme-less poster paths with https', () => {
    expect(normalizeWatchedMovie(watched).coverImage).toBe(
      'https://walter.trakt.tv/movies/100/poster.jpg',
    );
  });
});

describe('normalizeStudio', () => {
  test('builds the combined id from the trakt id', () => {
    expect(normalizeStudio({ name: 'Legendary', ids: { trakt: 5 } })).toEqual({
      id: 'trakt-studio-5',
      name: 'Legendary',
    });
  });
});
