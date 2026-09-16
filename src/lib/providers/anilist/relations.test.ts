import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import { getAnimeRelations } from './relations';

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

describe('getAnimeRelations', () => {
  test('humanizes relations and keeps recommendations and non-spoiler tags', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
          tags: [
            { name: 'Family Life', isMediaSpoiler: false },
            { name: 'Yuri', isMediaSpoiler: true },
            null,
          ],
          recommendations: {
            nodes: [
              { mediaRecommendation: { id: 4, type: 'MANGA', title: { romaji: 'Rec' } } },
              { mediaRecommendation: null },
            ],
          },
          relations: {
            edges: [
              {
                relationType: 'SIDE_STORY',
                node: { id: 2, type: 'ANIME', format: 'OVA', title: { romaji: 'Side' } },
              },
              {
                relationType: 'SOURCE',
                node: { id: 3, type: 'MANGA', format: 'MANGA', title: { romaji: 'Source' } },
              },
              { relationType: 'SEQUEL', node: null },
              null,
            ],
          },
        },
      },
    });

    const { relations, recommendations, tags } = await Effect.runPromise(
      getAnimeRelations({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(tags).toEqual(['Family Life']);
    expect(recommendations.map((item) => item.id)).toEqual(['anilist-4']);
    expect(relations.map((r) => [r.relation, r.item.id, r.item.type])).toEqual([
      ['Side story', 'anilist-2', 'ANIME'],
      ['Source', 'anilist-3', 'MANGA'],
    ]);
  });
});
