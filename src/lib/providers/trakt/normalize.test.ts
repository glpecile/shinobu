import { describe, expect, test } from 'bun:test';

import {
  normalizeCastEntry,
  normalizeCrew,
  normalizeHistoryItem,
  normalizeSearchResult,
  normalizeSeason,
  normalizeStudio,
  normalizeWatchedMovie,
  normalizeWatchedProgress,
  normalizeWatchedShow,
  orderSeasons,
  type TraktCastEntry,
  type TraktCrewEntry,
  type TraktHistoryItem,
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

/**
 * `/shows/:id/progress/watched` response, copied verbatim from Trakt's API
 * blueprint (fixture from the real payload shape, never from our own
 * interfaces — docs/solutions/trakt-progress-episodes-have-no-season-field.md).
 * Note what it proves: episodes carry no `season`, and specials never appear
 * (the app doesn't send `specials=true`).
 */
const PROGRESS_PAYLOAD: TraktShowProgress = {
  aired: 8,
  completed: 6,
  last_watched_at: '2015-03-21T19:03:58.000Z',
  seasons: [
    {
      number: 1,
      episodes: [
        { number: 1, completed: true },
        { number: 2, completed: true },
        { number: 3, completed: true },
        { number: 4, completed: true },
        { number: 5, completed: true },
        { number: 6, completed: true },
        { number: 7, completed: false },
        { number: 8, completed: false },
      ],
    },
  ],
};

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
    expect(normalizeWatchedProgress(progress).watchedKeys).toEqual(
      new Set(['1-1', '1-2', '2-2']),
    );
  });

  test('empty / missing seasons yield an empty set', () => {
    expect(normalizeWatchedProgress({}).watchedKeys).toEqual(new Set());
  });

  test('specials (season 0) are excluded by the request, not the normalizer', () => {
    // Trakt omits season 0 unless `specials=true` is sent, which the app never
    // does — so a progress payload simply never carries specials, and the
    // watched-key set stays free of "0-x" entries.
    expect(normalizeWatchedProgress(PROGRESS_PAYLOAD).watchedKeys).toEqual(
      new Set(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']),
    );
  });
});

describe('normalizeWatchedProgress next_episode (plan 0019 U1)', () => {
  test('carries season/number/title and the extended=full air instant', () => {
    const { nextEpisode } = normalizeWatchedProgress({
      ...PROGRESS_PAYLOAD,
      next_episode: {
        // Trakt's documented next_episode fields plus what extended=full adds
        // to any episode object (first_aired, runtime).
        season: 1,
        number: 7,
        title: 'Water',
        first_aired: '2015-04-19T01:00:00.000Z',
        runtime: 58,
      },
    });
    expect(nextEpisode).toEqual({
      season: 1,
      number: 7,
      title: 'Water',
      firstAired: '2015-04-19T01:00:00.000Z',
      runtime: 58,
    });
  });

  test('next_episode: null (caught up) leaves nextEpisode undefined', () => {
    const result = normalizeWatchedProgress({
      ...PROGRESS_PAYLOAD,
      next_episode: null,
    });
    expect(result.nextEpisode).toBeUndefined();
    // The watched-key half is unaffected by the pointer's absence.
    expect(result.watchedKeys.has('1-6')).toBe(true);
  });

  test('a missing next_episode key behaves like null', () => {
    expect(normalizeWatchedProgress(PROGRESS_PAYLOAD).nextEpisode).toBeUndefined();
  });

  test('first_aired: null is carried as null, not dropped', () => {
    // An unknown air date must stay distinguishable from "aired" — the Up Next
    // split excludes it knowingly instead of guessing.
    const { nextEpisode } = normalizeWatchedProgress({
      next_episode: { season: 2, number: 1, title: 'TBA', first_aired: null },
    });
    expect(nextEpisode).toEqual({
      season: 2,
      number: 1,
      title: 'TBA',
      firstAired: null,
    });
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

describe('normalizeHistoryItem', () => {
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

  test('a movie row → entry keyed by the log id, item typed MOVIE', () => {
    const raw: TraktHistoryItem = {
      id: 987654321,
      watched_at: '2026-07-20T18:30:00.000Z',
      action: 'watch',
      type: 'movie',
      movie,
    };

    const entry = normalizeHistoryItem(raw);
    expect(entry).toMatchObject({
      id: 'trakt-987654321',
      provider: 'trakt',
      watchedAt: '2026-07-20T18:30:00.000Z',
    });
    expect(entry?.item.type).toBe('MOVIE');
    expect(entry?.item.id).toBe('trakt-100');
    // A movie log carries no episode detail.
    expect(entry?.episodes).toBeUndefined();
    expect(entry?.season).toBeUndefined();
  });

  test('an episode row → entry whose item is the show, with season+episode', () => {
    const raw: TraktHistoryItem = {
      id: 42,
      watched_at: '2026-07-20T23:30:00.000Z',
      action: 'watch',
      type: 'episode',
      show,
      episode: { season: 2, number: 5, title: 'Nadeko Snake' },
    };

    const entry = normalizeHistoryItem(raw);
    expect(entry).toMatchObject({
      id: 'trakt-42',
      provider: 'trakt',
      season: 2,
      episodes: [5],
    });
    // The media item is the show, not the episode.
    expect(entry?.item.type).toBe('TV');
    expect(entry?.item.id).toBe('trakt-200');
  });

  test('watched_at is preserved verbatim as an instant, not a bare date (AE4)', () => {
    const raw: TraktHistoryItem = {
      id: 7,
      watched_at: '2026-07-20T23:30:00.000Z',
      type: 'movie',
      movie,
    };
    // The instant survives untouched — day grouping (not this normalizer)
    // converts it to a local day, so no truncation happens here.
    expect(normalizeHistoryItem(raw)?.watchedAt).toBe('2026-07-20T23:30:00.000Z');
  });

  test('a row of an unmodeled type drops out as null', () => {
    const raw = {
      id: 1,
      watched_at: '2026-07-20T18:30:00.000Z',
      type: 'person',
    } as unknown as TraktHistoryItem;
    expect(normalizeHistoryItem(raw)).toBeNull();
  });
});
