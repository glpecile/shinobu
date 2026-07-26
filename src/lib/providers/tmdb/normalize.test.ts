import { describe, expect, test } from 'bun:test';

import {
  earliestHomeRelease,
  normalizeCreditRows,
  normalizePersonDetails,
  normalizePersonSearch,
  pickPersonMatch,
  type TmdbCastCredit,
  type TmdbCrewCredit,
  type TmdbPersonResponse,
} from './normalize';

const NOW = '2026-07-19T12:00:00.000Z';

function movie(
  id: number,
  title: string,
  releaseDate: string | null,
  extra: Partial<TmdbCastCredit & TmdbCrewCredit> = {},
) {
  return {
    id,
    media_type: 'movie',
    title,
    release_date: releaseDate,
    poster_path: `/poster-${id}.jpg`,
    ...extra,
  };
}

function show(
  id: number,
  name: string,
  firstAirDate: string | null,
  extra: Partial<TmdbCastCredit & TmdbCrewCredit> = {},
) {
  return {
    id,
    media_type: 'tv',
    name,
    first_air_date: firstAirDate,
    ...extra,
  };
}

function personResponse(
  overrides: Partial<TmdbPersonResponse> = {},
): TmdbPersonResponse {
  return { id: 500, name: 'Tom Cruise', ...overrides };
}

describe('normalizePersonDetails', () => {
  test('maps bio fields and image sizes, omitting empties', () => {
    const { person } = normalizePersonDetails(
      personResponse({
        biography: 'An actor.',
        birthday: '1962-07-03',
        deathday: '',
        place_of_birth: 'Syracuse, New York, USA',
        known_for_department: 'Acting',
        profile_path: '/tom.jpg',
      }),
      NOW,
    );

    expect(person).toEqual({
      tmdbId: 500,
      name: 'Tom Cruise',
      headshot: 'https://image.tmdb.org/t/p/w342/tom.jpg',
      headshotFull: 'https://image.tmdb.org/t/p/original/tom.jpg',
      biography: 'An actor.',
      birthday: '1962-07-03',
      birthplace: 'Syracuse, New York, USA',
      knownForDepartment: 'Acting',
    });
  });

  test('renders empty strings for a person without a headshot', () => {
    const { person } = normalizePersonDetails(personResponse(), NOW);
    expect(person.headshot).toBe('');
    expect(person.headshotFull).toBe('');
    expect(person.biography).toBeUndefined();
  });
});

describe('normalizeCreditRows', () => {
  test('cast becomes an Acting row; crew groups by department', () => {
    const rows = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [movie(1, 'Top Gun', '1986-05-16')],
          crew: [
            movie(2, 'Mission', '1996-05-22', { department: 'Production', job: 'Producer' }),
          ],
        },
      }),
      NOW,
    );

    expect(rows.map((row) => row.role)).toEqual(['Acting', 'Production']);
    expect(rows[0].items[0]).toEqual({
      id: 'tmdb-movie-1',
      title: 'Top Gun',
      coverImage: 'https://image.tmdb.org/t/p/w342/poster-1.jpg',
      backdropImage: '',
      year: 1986,
      releaseDate: '1986-05-16',
      type: 'MOVIE',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: NOW,
      externalIds: { tmdb: 1 },
    });
  });

  test('sorts a row newest-first with undated (upcoming) work leading', () => {
    const [row] = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [
            movie(1, 'Old', '1999-01-01'),
            movie(2, 'Unscheduled', null),
            movie(3, 'New', '2026-01-01'),
          ],
        },
      }),
      NOW,
    );

    expect(row.items.map((item) => item.title)).toEqual([
      'Unscheduled',
      'New',
      'Old',
    ]);
  });

  test('dedupes a show credited once per character within a row', () => {
    const [row] = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [
            show(9, 'Rick and Morty', '2013-12-02', { character: 'Rick' }),
            show(9, 'Rick and Morty', '2013-12-02', { character: 'Morty' }),
          ],
        },
      }),
      NOW,
    );

    expect(row.items).toHaveLength(1);
    expect(row.items[0].id).toBe('tmdb-tv-9');
    expect(row.items[0].type).toBe('TV');
    expect(row.details['tmdb-tv-9']).toBe('Rick, Morty');
  });

  test('carries character/job details keyed by item id', () => {
    const rows = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [movie(1, 'Top Gun', '1986-05-16', { character: 'Maverick' })],
          crew: [
            movie(2, 'Mission', '1996-05-22', { department: 'Directing', job: 'Director' }),
            movie(3, 'Untold', '2001-01-01', { department: 'Directing' }),
          ],
        },
      }),
      NOW,
    );

    const acting = rows.find((row) => row.role === 'Acting');
    const directing = rows.find((row) => row.role === 'Directing');
    expect(acting?.details).toEqual({ 'tmdb-movie-1': 'Maverick' });
    // A credit without a job stays absent rather than mapping to ''.
    expect(directing?.details).toEqual({ 'tmdb-movie-2': 'Director' });
  });

  test('drops unknown media types, untitled credits, and department-less crew', () => {
    const rows = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [
            { id: 1, media_type: 'episode', title: 'Some Episode' },
            { id: 2, media_type: 'movie', title: '' },
          ],
          crew: [movie(3, 'Film', '2000-01-01', { job: 'Grip' })],
        },
      }),
      NOW,
    );

    expect(rows).toEqual([]);
  });

  test('the known-for department row leads even when smaller', () => {
    const rows = normalizeCreditRows(
      personResponse({
        known_for_department: 'Directing',
        combined_credits: {
          cast: [
            movie(1, 'Cameo A', '2001-01-01'),
            movie(2, 'Cameo B', '2002-01-01'),
          ],
          crew: [movie(3, 'The Film', '2003-01-01', { department: 'Directing', job: 'Director' })],
        },
      }),
      NOW,
    );

    expect(rows.map((row) => row.role)).toEqual(['Directing', 'Acting']);
  });

  test('treats a 0 vote_average as unrated', () => {
    const [row] = normalizeCreditRows(
      personResponse({
        combined_credits: {
          cast: [
            movie(1, 'Rated', '2001-01-01', { vote_average: 7.4 }),
            movie(2, 'Unrated', '2000-01-01', { vote_average: 0 }),
          ],
        },
      }),
      NOW,
    );

    expect(row.items[0].rating).toBe(7.4);
    expect(row.items[1].rating).toBeUndefined();
  });
});

describe('pickPersonMatch', () => {
  const candidates = [
    { tmdbId: 1, name: 'Tom Hardy' },
    { tmdbId: 2, name: 'Tom Cruise' },
    { tmdbId: 3, name: 'Cruise Tom' },
  ];

  test('prefers the exact (case/diacritic-insensitive) name match', () => {
    expect(pickPersonMatch(candidates, 'tom cruise')?.tmdbId).toBe(2);
    expect(pickPersonMatch([{ tmdbId: 4, name: 'José García' }], 'Jose Garcia')?.tmdbId).toBe(4);
  });

  test('falls back to a word-order swap before relevance order', () => {
    // AniList romanizes family-name-first; TMDB is given-name-first.
    expect(
      pickPersonMatch(
        [
          { tmdbId: 1, name: 'Yuki Kobayashi' },
          { tmdbId: 2, name: 'Yuki Kaji' },
        ],
        'Kaji Yuki',
      )?.tmdbId,
    ).toBe(2);
  });

  test('falls back to the top hit, and null on no results', () => {
    expect(pickPersonMatch(candidates, 'Thomas Cruise Mapother')?.tmdbId).toBe(1);
    expect(pickPersonMatch([], 'Anyone')).toBeNull();
  });
});

describe('normalizePersonSearch', () => {
  test('drops nameless results and keeps ids', () => {
    expect(
      normalizePersonSearch({
        results: [
          { id: 1, name: 'A' },
          { id: 2, name: '' },
          { id: 3 },
        ],
      }),
    ).toEqual([{ tmdbId: 1, name: 'A' }]);
  });
});

import {
  normalizeMovieCatalogue,
  normalizeStudioDetails,
  normalizeTitleSearch,
  normalizeTvCatalogue,
} from './normalize';

describe('normalizeMovieCatalogue', () => {
  test('maps catalogue fields, credits, and studios from one payload', () => {
    const result = normalizeMovieCatalogue(
      {
        id: 603,
        title: 'The Matrix',
        overview: 'A hacker learns the truth.',
        poster_path: '/matrix.jpg',
        backdrop_path: '/matrix-wide.jpg',
        release_date: '1999-03-30',
        runtime: 136,
        vote_average: 8.2,
        genres: [{ id: 1, name: 'Action' }, { id: 2, name: '' }],
        production_companies: [
          { id: 79, name: 'Village Roadshow Pictures' },
          { id: 80, name: '' },
        ],
        credits: {
          cast: [
            { id: 6384, name: 'Keanu Reeves', character: 'Neo', order: 0, profile_path: '/keanu.jpg' },
          ],
          crew: [
            { id: 9339, name: 'Lana Wachowski', department: 'Directing', job: 'Director' },
            { id: 9339, name: 'Lana Wachowski', department: 'Writing', job: 'Writer' },
            { id: 1, name: 'Grip Person', department: 'Crew', job: 'Grip' },
          ],
        },
      },
      NOW,
    );

    expect(result?.catalogue).toEqual({
      id: 'tmdb-movie-603',
      title: 'The Matrix',
      coverImage: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
      backdropImage: 'https://image.tmdb.org/t/p/w1280/matrix-wide.jpg',
      overview: 'A hacker learns the truth.',
      year: 1999,
      releaseDate: '1999-03-30',
      runtime: 136,
      rating: 8.2,
      genres: ['Action'],
      type: 'MOVIE',
      currentProgress: 0,
      progressUnit: 'episode',
      lastUpdated: NOW,
      externalIds: { tmdb: 603 },
    });
    expect(result?.cast).toEqual([
      {
        id: 'tmdb-person-6384',
        name: 'Keanu Reeves',
        character: 'Neo',
        headshot: 'https://image.tmdb.org/t/p/w185/keanu.jpg',
        tmdbId: 6384,
      },
    ]);
    // One entry per person, jobs merged across departments, billing order.
    expect(result?.crew.map((member) => [member.name, member.job])).toEqual([
      ['Lana Wachowski', 'Director, Writer'],
      ['Grip Person', 'Grip'],
    ]);
    expect(result?.studios).toEqual([
      { id: 'tmdb-studio-79', name: 'Village Roadshow Pictures', tmdbId: 79 },
    ]);
  });

  test('returns null for an untitled record', () => {
    expect(normalizeMovieCatalogue({ id: 1 }, NOW)).toBeNull();
  });
});

describe('normalizeTvCatalogue', () => {
  test('reads aggregate credits, episode runtime, and totals', () => {
    const result = normalizeTvCatalogue(
      {
        id: 94605,
        name: 'Arcane',
        first_air_date: '2021-11-06',
        episode_run_time: [41],
        number_of_episodes: 18,
        aggregate_credits: {
          cast: [
            {
              id: 22227,
              name: 'Hailee Steinfeld',
              order: 0,
              roles: [{ character: 'Vi (voice)' }, { character: 'Young Vi (voice)' }],
            },
          ],
          crew: [
            { id: 5, name: 'Show Runner', department: 'Production', jobs: [{ job: 'Executive Producer' }] },
          ],
        },
      },
      NOW,
    );

    expect(result?.catalogue.type).toBe('TV');
    expect(result?.catalogue.runtime).toBe(41);
    expect(result?.catalogue.totalEpisodes).toBe(18);
    expect(result?.cast[0].character).toBe('Vi (voice), Young Vi (voice)');
    expect(result?.cast[0].tmdbId).toBe(22227);
    expect(result?.crew[0].job).toBe('Executive Producer');
  });
});

describe('normalizeStudioDetails', () => {
  test('builds company header and per-medium rows, dropping empty ones', () => {
    const result = normalizeStudioDetails(
      {
        company: {
          id: 21444,
          name: 'MAPPA',
          logo_path: '/mappa.png',
          headquarters: 'Suginami, Tokyo',
          homepage: 'https://mappa.co.jp',
        },
        movies: { results: [] },
        tv: {
          results: [
            { id: 95479, name: 'Jujutsu Kaisen', first_air_date: '2020-10-03' },
            { id: 2, name: '' },
          ],
        },
      },
      NOW,
    );

    expect(result.company).toEqual({
      tmdbId: 21444,
      name: 'MAPPA',
      logo: 'https://image.tmdb.org/t/p/w300/mappa.png',
      headquarters: 'Suginami, Tokyo',
      homepage: 'https://mappa.co.jp',
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('TV Shows');
    expect(result.rows[0].items.map((item) => item.id)).toEqual(['tmdb-tv-95479']);
  });
});

describe('normalizeTitleSearch', () => {
  test('maps movie hits with tmdb id + year, dropping untitled ones', () => {
    const result = normalizeTitleSearch(
      {
        results: [
          { id: 42, title: "Rabbit's Moon", release_date: '1971-01-01' },
          { id: 7, title: '', release_date: '2000-01-01' },
          { id: 9, title: 'Yearless', release_date: null },
        ],
      },
      'movie',
      NOW,
    );
    expect(result.map((item) => [item.id, item.externalIds.tmdb, item.year])).toEqual([
      ['tmdb-movie-42', 42, 1971],
      ['tmdb-movie-9', 9, undefined],
    ]);
  });

  test('empty results yield an empty list', () => {
    expect(normalizeTitleSearch({}, 'movie', NOW)).toEqual([]);
  });
});

/** TMDB release types: 4 Digital, 5 Physical. */
const digital = (iso: string, date: string) => ({
  iso_3166_1: iso,
  release_dates: [{ type: 4, release_date: date }],
});
const physical = (iso: string, date: string) => ({
  iso_3166_1: iso,
  release_dates: [{ type: 5, release_date: date }],
});

describe('earliestHomeRelease', () => {

  test('picks the earliest digital date across regions', () => {
    expect(
      earliestHomeRelease([
        digital('US', '2026-03-04T00:00:00.000Z'),
        digital('FR', '2026-02-11T00:00:00.000Z'),
        digital('JP', '2026-05-20T00:00:00.000Z'),
      ]),
    ).toEqual({ date: '2026-02-11', kind: 'digital' });
  });

  test('falls back to physical when no region has a digital release', () => {
    expect(
      earliestHomeRelease([
        physical('US', '2026-06-09T00:00:00.000Z'),
        physical('DE', '2026-07-01T00:00:00.000Z'),
      ]),
    ).toEqual({ date: '2026-06-09', kind: 'physical' });
  });

  test('with both present, the earlier one wins and names its own type', () => {
    expect(
      earliestHomeRelease([
        physical('US', '2026-06-09T00:00:00.000Z'),
        digital('US', '2026-04-15T00:00:00.000Z'),
      ]),
    ).toEqual({ date: '2026-04-15', kind: 'digital' });
    expect(
      earliestHomeRelease([
        physical('GB', '2026-01-05T00:00:00.000Z'),
        digital('US', '2026-04-15T00:00:00.000Z'),
      ]),
    ).toEqual({ date: '2026-01-05', kind: 'physical' });
  });

  test('a shared earliest date reports both, so the label can say so', () => {
    expect(
      earliestHomeRelease([
        {
          iso_3166_1: 'US',
          release_dates: [
            { type: 4, release_date: '2026-04-15T00:00:00.000Z' },
            { type: 5, release_date: '2026-04-15T00:00:00.000Z' },
          ],
        },
      ]),
    ).toEqual({ date: '2026-04-15', kind: 'both' });
  });

  test('theatrical/premiere/TV types and junk never count as a home release', () => {
    expect(
      earliestHomeRelease([
        {
          iso_3166_1: 'US',
          release_dates: [
            { type: 1, release_date: '2025-09-01T00:00:00.000Z' },
            { type: 2, release_date: '2025-10-01T00:00:00.000Z' },
            { type: 3, release_date: '2025-10-10T00:00:00.000Z' },
            { type: 6, release_date: '2026-08-01T00:00:00.000Z' },
            { type: 4, release_date: '' },
            { type: 4, release_date: null },
            { type: 5, release_date: 'not a date' },
          ],
        },
      ]),
    ).toBeNull();
  });

  test('degrades silently on an absent or empty payload', () => {
    expect(earliestHomeRelease(undefined)).toBeNull();
    expect(earliestHomeRelease(null)).toBeNull();
    expect(earliestHomeRelease([])).toBeNull();
    expect(earliestHomeRelease([{ iso_3166_1: 'US', release_dates: null }])).toBeNull();
  });
});

describe('normalizeMovieCatalogue release dates', () => {
  test('carries the full release date and the earliest home release', () => {
    const result = normalizeMovieCatalogue(
      {
        id: 616,
        title: 'Jinsei',
        release_date: '2026-01-30',
        release_dates: {
          results: [
            { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2026-01-30T00:00:00.000Z' }] },
            { iso_3166_1: 'US', release_dates: [{ type: 4, release_date: '2026-03-11T00:00:00.000Z' }] },
          ],
        },
      },
      NOW,
    );
    expect(result?.catalogue.releaseDate).toBe('2026-01-30');
    expect(result?.catalogue.homeReleaseDate).toBe('2026-03-11');
    expect(result?.catalogue.homeReleaseKind).toBe('digital');
  });

  test('omits both fields entirely when TMDB has neither', () => {
    const result = normalizeMovieCatalogue({ id: 7, title: 'Undated' }, NOW);
    expect(result?.catalogue.releaseDate).toBeUndefined();
    expect(result?.catalogue.homeReleaseDate).toBeUndefined();
    expect(result?.catalogue.homeReleaseKind).toBeUndefined();
  });
});
