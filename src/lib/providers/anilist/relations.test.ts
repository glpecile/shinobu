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
  test('humanizes the relation type and normalizes anime and manga nodes', async () => {
    const fetch = mockFetch({
      data: {
        Media: {
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

    const relations = await Effect.runPromise(
      getAnimeRelations({ ...DEPS, fetch }, { mediaId: 1 }),
    );

    expect(relations.map((r) => [r.relation, r.item.id, r.item.type])).toEqual([
      ['Side story', 'anilist-2', 'ANIME'],
      ['Source', 'anilist-3', 'MANGA'],
    ]);
  });
});
