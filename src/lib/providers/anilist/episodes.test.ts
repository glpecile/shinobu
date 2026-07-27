import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { getAnimeEpisodes } from './episodes';

function mockFetch(response: unknown): HttpFetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => response,
    }) as Awaited<ReturnType<HttpFetch>>;
}

const DEPS = { fetch: mockFetch({}), tokens: { get: () => null, set: () => {}, clear: () => {} } };

describe('getAnimeEpisodes', () => {
  test('builds a single season from airing schedule and streaming episodes', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
          episodes: 2,
          duration: 24,
          airingSchedule: {
            edges: [
              { node: { episode: 1, airingAt: 1_000_000_000 } },
              { node: { episode: 2, airingAt: 1_000_086_400 } },
            ],
          },
          streamingEpisodes: [
            { title: 'The First Case', thumbnail: 'https://img/1.jpg' },
            { title: 'The Second Case', thumbnail: 'https://img/2.jpg' },
          ],
        },
      },
    });

    const season = await Effect.runPromise(
      getAnimeEpisodes({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    // `number: 1` is the section index, not a canonical-season claim, and the
    // title stays neutral — a sequel entry's episodes are not "Season 1"
    // (plan 0027 R8; the details accordion overlays the mapped season).
    expect(season.number).toBe(1);
    expect(season.title).toBe('Episodes');
    expect(season.episodes).toHaveLength(2);
    expect(season.episodes[0]).toMatchObject({
      number: 1,
      title: 'The First Case',
      runtime: 24,
      firstAired: new Date(1_000_000_000 * 1000).toISOString(),
    });
    expect(season.episodes[1]).toMatchObject({
      number: 2,
      title: 'The Second Case',
      runtime: 24,
      firstAired: new Date(1_000_086_400 * 1000).toISOString(),
    });
  });

  test('falls back to synthetic titles when streaming episodes are missing', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
          episodes: 1,
          duration: null,
          airingSchedule: { edges: [] },
          streamingEpisodes: null,
        },
      },
    });

    const season = await Effect.runPromise(
      getAnimeEpisodes({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(season.episodes).toHaveLength(1);
    expect(season.episodes[0].title).toBe('Episode 1');
    expect(season.episodes[0].runtime).toBeUndefined();
    expect(season.episodes[0].firstAired).toBeUndefined();
  });

  test('uses scheduled episodes while an ongoing anime has no final count', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
          episodes: null,
          duration: 24,
          airingSchedule: {
            edges: [
              { node: { episode: 1, airingAt: 1_000_000_000 } },
              { node: { episode: 2, airingAt: 1_000_086_400 } },
              { node: { episode: 3, airingAt: 1_000_172_800 } },
            ],
          },
          streamingEpisodes: null,
        },
      },
    });

    const season = await Effect.runPromise(
      getAnimeEpisodes({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(season.episodes).toHaveLength(3);
    expect(season.episodes.map((episode) => episode.number)).toEqual([1, 2, 3]);
  });

  test('tolerates a null Media response', async () => {
    const fetch = mockFetch({ data: { Media: null } });

    const season = await Effect.runPromise(
      getAnimeEpisodes({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(season.episodes).toHaveLength(0);
  });
});
