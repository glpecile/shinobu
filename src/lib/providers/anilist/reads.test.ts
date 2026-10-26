import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import type { HttpFetch } from '@/lib/http/types';
import type { TokenStore } from '@/lib/providers/token-store';
import { getListActivity } from './reads';

test('a filtered activity page retains AniList pagination', async () => {
  const media = { id: 21, type: 'ANIME', format: 'TV', title: { english: 'One Piece' } };
  const fetch: HttpFetch = async () => Response.json({ data: { Page: {
    pageInfo: { hasNextPage: true },
    activities: [
      { id: 5001, status: 'plans to watch', progress: null, createdAt: 1_752_000_000, media },
      { id: 5002, status: 'watched episode', progress: '1', createdAt: 1_752_000_100, media },
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
});
