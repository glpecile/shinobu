import { describe, expect, test } from 'bun:test';

import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeSearchResult,
  normalizeSeason,
  normalizeStudio,
  normalizeWatchedMovie,
  normalizeWatchedProgress,
  normalizeWatchedShow,
  orderSeasons,
  type TraktCastEntry,
  type TraktCrewEntry,
  type TraktMovie,
  type TraktShow,
  type TraktShowProgress,
  type TraktShowSeason,
  type TraktWatchedMovie,
  type TraktWatchedShow,
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

describe('orderSeasons', () => {
  test('numbers seasons ascending but moves specials (0) to the end', () => {
    const ordered = orderSeasons([
      { number: 0 },
      { number: 2 },
      { number: 1 },
      { number: 0, extra: 1 },
    ]);
    expect(ordered.map((s) => s.number)).toEqual([1, 2, 0, 0]);
  });
});

describe('normalizeSeason', () => {
  const season: TraktShowSeason = {
    number: 1,
    ids: { trakt: 9 },
    // Payload order is reversed so the ascending sort is observable.
    episodes: [
      { season: 1, number: 2, title: 'Two', runtime: 45 },
      { season: 1, number: 1, title: '', runtime: 50, first_aired: '2022-01-01T00:00:00.000Z' },
    ],
  };

  test('labels as "Season N", sorts episodes ascending, falls back blank titles', () => {
    const normalized = normalizeSeason(season);
    expect(normalized.title).toBe('Season 1');
    expect(normalized.episodes.map((e) => e.number)).toEqual([1, 2]);
    expect(normalized.episodes.map((e) => e.title)).toEqual(['Episode 1', 'Two']);
  });

  test('preserves runtime and airdate and drops empty/absent optionals', () => {
    const normalized = normalizeSeason(season);
    expect(normalized.episodes[0]).toEqual({
      number: 1,
      title: 'Episode 1',
      firstAired: '2022-01-01T00:00:00.000Z',
      runtime: 50,
    });
    expect(normalized.episodes[1]).toEqual({
      number: 2,
      title: 'Two',
      runtime: 45,
    });
  });

  test('season 0 is labelled "Specials"', () => {
    expect(
      normalizeSeason({ number: 0, ids: { trakt: 1 }, episodes: [] }).title,
    ).toBe('Specials');
  });
});

describe('normalizeWatchedProgress', () => {
  test('collects "S-E" keys for completed episodes, tolerating 0/1 and true/false', () => {
    // Real payload shape: progress episodes carry no `season` field — the
    // season number lives only on the enclosing season object.
    const progress: TraktShowProgress = {
      seasons: [
        { number: 1, episodes: [
          { number: 1, completed: true },
          { number: 2, completed: 1 },
          { number: 3, completed: false },
        ] },
        { number: 2, episodes: [
          { number: 1, completed: 0 },
          { number: 2, completed: true },
        ] },
      ],
    };
    expect(normalizeWatchedProgress(progress)).toEqual(
      new Set(['1-1', '1-2', '2-2']),
    );
  });

  test('empty / missing seasons yield an empty set', () => {
    expect(normalizeWatchedProgress({})).toEqual(new Set());
  });
});

describe('normalizeWatchedShow', () => {
  test('counts watched episodes excluding specials (season 0)', () => {
    const watched: TraktWatchedShow = {
      plays: 12,
      last_watched_at: '2026-07-01T20:00:00.000Z',
      last_updated_at: '2026-07-01T20:00:00.000Z',
      show: {
        title: 'Saga of Tanya the Evil',
        ids: { trakt: 115 },
        aired_episodes: 12,
      },
      seasons: [
        {
          number: 0,
          episodes: Array.from({ length: 10 }, (_, index) => ({
            number: index + 1,
            last_watched_at: '2026-07-01T20:00:00.000Z',
          })),
        },
        {
          number: 1,
          episodes: [
            { number: 1, last_watched_at: '2026-07-01T20:00:00.000Z' },
            { number: 2, last_watched_at: '2026-07-01T20:00:00.000Z' },
          ],
        },
      ],
    };

    const item = normalizeWatchedShow(watched);
    expect(item.currentProgress).toBe(2);
    expect(item.totalEpisodes).toBe(12);
  });
});
