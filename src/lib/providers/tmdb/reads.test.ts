import { describe, expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import { getMediaCatalogue, getTvEpisode, getTvSeasons, searchMovie } from './reads';

/** Records every requested URL and answers with an empty result set. */
function recordingFetch(urls: string[]) {
  return (input: RequestInfo | URL): Promise<Response> => {
    urls.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
}

describe('searchMovie', () => {
  test('constrains the search by primary_release_year when a year is known', async () => {
    const urls: string[] = [];
    await Effect.runPromise(
      searchMovie(
        { fetch: recordingFetch(urls), token: 'test-token' },
        { query: 'Motor City', year: 2025 },
      ),
    );

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/search/movie?query=Motor%20City');
    expect(urls[0]).toContain('primary_release_year=2025');
  });

  test('omits the year filter entirely for a yearless item', async () => {
    const urls: string[] = [];
    await Effect.runPromise(
      searchMovie(
        { fetch: recordingFetch(urls), token: 'test-token' },
        { query: 'Labyrinth' },
      ),
    );

    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain('primary_release_year');
  });
});

describe('getMediaCatalogue', () => {
  test('appends release_dates to the movie document — one round-trip, not two', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ id: 603, title: 'The Matrix' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };

    await Effect.runPromise(
      getMediaCatalogue(
        { fetch, token: 'test-token' },
        { kind: 'movie', tmdbId: 603 },
      ),
    );

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('append_to_response=credits,release_dates');
  });

  test.each([['Ended', true], ['Canceled', true], ['Returning Series', false], [undefined, undefined]] as const)('TV catalogue carries completion status %s without movie release dates', async (status, ended) => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ id: 94605, name: 'Arcane', status }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };

    const result = await Effect.runPromise(
      getMediaCatalogue(
        { fetch, token: 'test-token' },
        { kind: 'tv', tmdbId: 94605 },
      ),
    );

    expect(urls[0]).toContain('append_to_response=aggregate_credits');
    expect(urls[0]).not.toContain('release_dates');
    expect(result.catalogue.seriesEnded).toBe(ended);
  });
});

describe('getTvSeasons', () => {
  test('reads the layout and seasons 0–19 in one call, and normalizes', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            seasons: [
              { season_number: 0, episode_count: 1 },
              { season_number: 1, episode_count: 2 },
            ],
            'season/0': {
              episodes: [{ episode_number: 1, name: 'Pilot Special' }],
            },
            'season/1': {
              episodes: [
                // Out of order + a null row + a nameless episode: normalize
                // must sort, drop, and synthesize the title.
                {
                  episode_number: 2,
                  name: '',
                  air_date: '2099-08-01',
                  runtime: 25,
                },
                null,
                {
                  episode_number: 1,
                  name: 'In Treacherous Waters',
                  overview: 'A bat.',
                  air_date: '2024-08-01',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };

    const seasons = await Effect.runPromise(
      getTvSeasons({ fetch, token: 'test-token' }, { tmdbId: 93222 }),
    );

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('append_to_response=season/0,season/1,');
    // Specials sort last, mirroring the Trakt normalizer.
    expect(seasons.map((season) => season.title)).toEqual([
      'Season 1',
      'Specials',
    ]);
    expect(seasons[0]?.episodes).toEqual([
      {
        number: 1,
        title: 'In Treacherous Waters',
        overview: 'A bat.',
        firstAired: '2024-08-01',
      },
      { number: 2, title: 'Episode 2', firstAired: '2099-08-01', runtime: 25 },
    ]);
  });

  test('fetches seasons past 19 in a follow-up batch', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      const body = urls.length > 1
        ? {}
        : {
            seasons: Array.from({ length: 25 }, (_, index) => ({
              season_number: index + 1,
              episode_count: 10,
            })),
          };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };

    const seasons = await Effect.runPromise(
      getTvSeasons({ fetch, token: 'test-token' }, { tmdbId: 456 }),
    );

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('season/19');
    expect(urls[0]).not.toContain('season/20');
    expect(urls[1]).toContain('append_to_response=season/20,season/21,season/22,season/23,season/24,season/25');
    // A season the append response omitted still renders, just empty.
    expect(seasons).toHaveLength(25);
    expect(seasons[0]?.episodes).toEqual([]);
  });
});

describe('getTvEpisode', () => {
  test('one call with the credits append, normalized with regulars before guests', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            episode_number: 10,
            name: 'The Laughing Dead',
            still_path: '/still.jpg',
            vote_average: 7.4,
            guest_stars: [{ id: 2, name: 'Guest', character: 'Clown', order: 0 }],
            credits: {
              cast: [{ id: 1, name: 'Regular', character: 'Frank', order: 3 }],
              guest_stars: [{ id: 2, name: 'Guest', character: 'Clown', order: 0 }],
              crew: [{ id: 3, name: 'Dir', job: 'Director', department: 'Directing' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };

    const details = await Effect.runPromise(
      getTvEpisode({ fetch, token: 'test-token' }, { tmdbId: 7, season: 2, number: 10 }),
    );

    expect(urls).toEqual([
      'https://api.themoviedb.org/3/tv/7/season/2/episode/10?append_to_response=credits',
    ]);
    expect(details.episode.title).toBe('The Laughing Dead');
    expect(details.still).toBe('https://image.tmdb.org/t/p/w780/still.jpg');
    expect(details.ratings).toEqual([{ source: 'tmdb', value: 7.4, scale: 10 }]);
    expect(details.cast.map((member) => member.name)).toEqual(['Regular', 'Guest']);
    expect(details.crew[0]?.job).toBe('Director');
  });
});
