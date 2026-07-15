import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { getAnimeCredits } from './credits';

function mockFetch(response: unknown): HttpFetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => response,
    }) as Awaited<ReturnType<HttpFetch>>;
}

const DEPS = {
  fetch: mockFetch({}),
  tokens: { get: () => null, set: () => {}, clear: () => {} },
};

describe('getAnimeCredits', () => {
  test('normalizes Japanese voice actors, merged staff roles, and studios', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
          characters: {
            edges: [
              {
                node: { name: { full: 'Momo Ayase' } },
                voiceActors: [
                  {
                    id: 1,
                    name: { full: 'Shion Wakayama' },
                    image: { large: 'https://img/voice-actor.jpg' },
                  },
                ],
              },
              {
                node: { name: { full: 'Seiko Ayase' } },
                voiceActors: [
                  {
                    id: 1,
                    name: { full: 'Shion Wakayama' },
                    image: { large: 'https://img/voice-actor.jpg' },
                  },
                ],
              },
            ],
          },
          staff: {
            edges: [
              {
                role: 'Director',
                node: {
                  id: 2,
                  name: { full: 'Fuga Yamashiro' },
                  image: { large: 'https://img/director.jpg' },
                },
              },
              {
                role: 'Storyboard',
                node: {
                  id: 2,
                  name: { full: 'Fuga Yamashiro' },
                  image: { large: 'https://img/director.jpg' },
                },
              },
            ],
          },
          studios: {
            nodes: [
              { id: 3, name: 'Science SARU' },
              { id: 3, name: 'Science SARU' },
              { id: 4, name: null },
            ],
          },
        },
      },
    });

    const credits = await Effect.runPromise(
      getAnimeCredits({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(credits.cast).toEqual([
      {
        id: 'anilist-person-1',
        name: 'Shion Wakayama',
        character: 'Momo Ayase, Seiko Ayase',
        headshot: 'https://img/voice-actor.jpg',
      },
    ]);
    expect(credits.crew).toEqual([
      {
        id: 'anilist-person-2',
        name: 'Fuga Yamashiro',
        job: 'Director, Storyboard',
        headshot: 'https://img/director.jpg',
      },
    ]);
    expect(credits.studios).toEqual([
      { id: 'anilist-studio-3', name: 'Science SARU' },
    ]);
  });

  test('tolerates a missing media response', async () => {
    const fetch = mockFetch({ data: { Media: null } });

    await expect(
      Effect.runPromise(getAnimeCredits({ ...DEPS, fetch }, { mediaId: 1 })),
    ).resolves.toEqual({ cast: [], crew: [], studios: [] });
  });
});
