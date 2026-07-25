import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { searchMovie } from './reads';

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
