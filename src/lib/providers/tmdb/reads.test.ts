import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { getMediaCatalogue, getTvSeasons, searchMovie } from './reads';

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

  test('leaves the tv document alone — release_dates is movie-only', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ id: 94605, name: 'Arcane' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };

    await Effect.runPromise(
      getMediaCatalogue(
        { fetch, token: 'test-token' },
        { kind: 'tv', tmdbId: 94605 },
      ),
    );

    expect(urls[0]).toContain('append_to_response=aggregate_credits');
    expect(urls[0]).not.toContain('release_dates');
  });
});

describe('getTvSeasons', () => {
  test('folds every season into append_to_response batches and normalizes', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
      if (!url.includes('append_to_response')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              seasons: [
                { season_number: 0, episode_count: 1 },
                { season_number: 1, episode_count: 2 },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
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

    // One layout call + one batched append call — never one call per season.
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('append_to_response=season/0,season/1');
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

  test('splits shows beyond 20 seasons across requests', async () => {
    const urls: string[] = [];
    const fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
      const body = url.includes('append_to_response')
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

    // Layout + ceil(25 / 20) append batches.
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain('season/20');
    expect(urls[1]).not.toContain('season/21');
    expect(urls[2]).toContain('season/21');
    // A season the append response omitted still renders, just empty.
    expect(seasons).toHaveLength(25);
    expect(seasons[0]?.episodes).toEqual([]);
  });
});
