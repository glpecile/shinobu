import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';

import type { SerializdDeps } from './deps';
import { getSerializdWatchedShows } from './watched';

const session = { accessToken: 'tok', username: 'gian' };
const show = { showId: 1396, showName: 'Breaking Bad', seasonIds: [3572], dateAdded: '2026-10-10T22:56:46Z', bannerImage: '/show.jpg' };

test('series history includes later pages and preserves TMDB identity without inventing episode progress', async () => {
  const calls: string[] = [];
  const deps: SerializdDeps = {
    session, baseUrl: 'https://api.test',
    fetch: async (url, init) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
      return Response.json({ totalPages: 2, items: calls.length === 1 ? [{ ...show, seasonIds: [] }] : [show] });
    },
  };
  const items = await Effect.runPromise(getSerializdWatchedShows(deps));
  expect(calls).toEqual([1, 2].map((page) => `https://api.test/user/gian/watchedpage_v2/${page}?sort_by=date_added_desc`));
  expect(items).toEqual([{ watchedSeasons: 1, totalSeasons: undefined, item: {
    id: 'serializd-1396', title: 'Breaking Bad', type: 'TV', externalIds: { tmdb: 1396 },
    coverImage: 'https://image.tmdb.org/t/p/w342/show.jpg', currentProgress: 0,
    progressUnit: 'episode', lastUpdated: show.dateAdded,
  } }]);
});

test('an empty watched library stops after its first page', async () => {
  let calls = 0;
  expect(await Effect.runPromise(getSerializdWatchedShows({
    session, baseUrl: 'https://api.test', fetch: async () => {
      calls++;
      return Response.json({ items: [], totalPages: 0 });
    },
  }))).toEqual([]);
  expect(calls).toBe(1);
});

test.each([
  [new Response('', { status: 500 }), 'ProviderNetworkError'],
  [Response.json({ message: 'not a watched page' }), 'ProviderDecodeError'],
] as const)('a failed later page never becomes a successful partial watched snapshot (%s)', async (response, tag) => {
  let calls = 0;
  const error = await Effect.runPromise(Effect.flip(getSerializdWatchedShows({
    session, baseUrl: 'https://api.test', fetch: async () => ++calls === 1
      ? Response.json({ items: [show], totalPages: 2 }) : response,
  })));
  expect(error._tag).toBe(tag);
});

test('missing or unsafe account identity cannot start watched reads', async () => {
  for (const username of [null, '../other']) {
    const error = await Effect.runPromise(Effect.flip(getSerializdWatchedShows({
      session: username == null ? null : { ...session, username }, baseUrl: 'https://api.test',
      fetch: async () => { throw new Error('must not fetch'); },
    })));
    expect(error._tag).toBe('ProviderAuthError');
  }
});
