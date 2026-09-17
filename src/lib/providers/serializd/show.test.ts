import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { SerializdDeps } from './deps';
import { getSerializdShow } from './show';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function fakeDeps(
  respond: () => Response,
  onRequest?: (r: Recorded) => void,
): SerializdDeps {
  return {
    baseUrl: 'https://api.test',
    session: { accessToken: 'tok', username: 'gian' },
    fetch: async (input, init) => {
      onRequest?.({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return respond();
    },
  };
}

describe('getSerializdShow', () => {
  test('GETs /show/{tmdbId} and returns the season rows verbatim', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps(
      () =>
        Response.json({
          seasons: [
            { id: 11, seasonNumber: 1, episodeCount: 7 },
            { id: 12, seasonNumber: 2, episodeCount: 13 },
          ],
        }),
      (r) => requests.push(r),
    );

    const show = await Effect.runPromise(getSerializdShow(deps, { tmdbId: 1396 }));

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(new URL(requests[0].url).pathname).toBe('/show/1396');
    expect(show.seasons).toEqual([
      { id: 11, seasonNumber: 1, episodeCount: 7 },
      { id: 12, seasonNumber: 2, episodeCount: 13 },
    ]);
  });

  test('is unauthenticated — the catalogue read sends no bearer token', async () => {
    const requests: Recorded[] = [];
    const deps = fakeDeps(() => Response.json({ seasons: [] }), (r) => requests.push(r));

    await Effect.runPromise(getSerializdShow(deps, { tmdbId: 1396 }));

    expect(requests[0].headers.Authorization).toBeUndefined();
  });
});
