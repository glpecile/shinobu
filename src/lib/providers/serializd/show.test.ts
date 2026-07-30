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

  test('a body without a seasons array decodes to an empty-shaped response', async () => {
    // Every field of RawShowResponse is optional because the body is UNVERIFIED
    // (U10 captures it) — a missing `seasons` must not throw.
    const show = await Effect.runPromise(
      getSerializdShow(fakeDeps(() => Response.json({ title: 'Breaking Bad' })), {
        tmdbId: 1396,
      }),
    );
    expect(show.seasons).toBeUndefined();
  });

  test('a non-2xx propagates as a provider error — never an empty season list', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        getSerializdShow(
          fakeDeps(() => new Response('{}', { status: 500 })),
          { tmdbId: 1396 },
        ),
      ),
    );
    expect(error._tag).toBe('ProviderNetworkError');
  });
});
