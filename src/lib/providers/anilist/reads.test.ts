import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';
import { getListActivity, searchMedia } from './reads';

test('a filtered activity page retains AniList pagination', async () => {
  const media = { id: 21, type: 'ANIME', format: 'TV', title: { english: 'One Piece' } };
  const fetch: HttpFetch = async () => Response.json({ data: { Page: {
    pageInfo: { hasNextPage: true },
    activities: [
      { id: 5002, status: 'watched episode', progress: '1', createdAt: 1_752_000_100, media },
      { id: 5001, status: 'plans to watch', progress: null, createdAt: 1_752_000_000, media },
    ],
  } } });
  const tokens: TokenStore = {
    get: () => ({ accessToken: 'tok' }),
    set: () => {},
    clear: () => {},
  };

  const result = await Effect.runPromise(getListActivity({ fetch, tokens }, { viewerId: 1, page: 1 }));

  expect(result.hasNextPage).toBe(true);
  expect(result.entries).toHaveLength(1);
  expect(result.readTo).toBe(new Date(1_752_000_000 * 1000).toISOString());
});

test.each([
  ['ALL', 'media(search: $search, sort: SEARCH_MATCH)'],
  ['MANGA', 'media(search: $search, type: MANGA, sort: SEARCH_MATCH)'],
] as const)('a %s title search asks AniList for that type alone', async (type, media) => {
  const bodies: string[] = [];
  const fetch: HttpFetch = async (_input, init) => {
    bodies.push(String(init?.body));
    return Response.json({ data: { Page: { media: [] } } });
  };
  const tokens: TokenStore = { get: () => null, set: () => {}, clear: () => {} };

  await Effect.runPromise(searchMedia({ fetch, tokens }, { query: 'frieren', type }));

  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0] ?? '').query).toContain(media);
});
