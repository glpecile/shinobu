import { expect, test } from 'bun:test';
import { Effect } from 'effect';
import type { ProviderError } from '@/lib/providers/errors';

import type { SerializdDeps } from './deps';
import { getSerializdList, getSerializdListsPage } from './lists';

const show = { showId: 1396, showName: 'Breaking Bad', bannerImage: '/show.jpg' };
const list = { listId: 42, listName: 'Pilots', owner: { username: 'gian' }, numberOfItems: 2, listItems: [show] };

function deps(payload: unknown): SerializdDeps {
  return { baseUrl: 'https://api.test', session: { accessToken: 'tok', username: 'gian' }, fetch: async () => Response.json(payload) };
}

test.each(['created', 'liked'] as const)('%s lists use the verified sort and paginate without fetching each list', async (kind) => {
  const d = deps({ lists: [list], totalPages: 2 });
  const calls: string[] = [];
  d.fetch = async (url, init) => {
    calls.push(String(url));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    return Response.json({ lists: [list], totalPages: 2 });
  };
  const first = await Effect.runPromise(getSerializdListsPage(d, { username: 'gian', kind, page: 1 }));
  expect(calls).toEqual([`https://api.test/user/gian/${kind === 'liked' ? 'liked_lists?sort_by=liked_on_desc' : 'lists?sort_by=date_created_desc'}&page=1`]);
  expect(first.hasNextPage).toBe(true);
  expect(first.lists[0]).toMatchObject({ id: '42', title: 'Pilots', itemCount: 2, previews: [{ title: 'Breaking Bad', externalIds: { tmdb: 1396 } }] });
  expect((await Effect.runPromise(getSerializdListsPage(d, { username: 'gian', kind, page: 2 }))).hasNextPage).toBe(false);
});

test('show, season, and episode entries of the same show retain separate identity and coordinates', async () => {
  const season = { ...show, seasonId: 3572, season: { name: 'Season 1', seasonNumber: 1, posterPath: '/season.jpg' } };
  const episode = { ...season, episode: { episode_number: 1, name: 'Pilot' } };
  const result = await Effect.runPromise(getSerializdList(deps({ ...list, numberOfItems: 3, listItems: [show, season, episode] }), '42'));
  expect(new Set(result.entries.map((entry) => entry.id)).size).toBe(3);
  expect(result.entries[0].item.id).toBe('tmdb-tv-1396');
  expect(result.entries[1]).toMatchObject({ season: 1, subtitle: 'Season 1', item: { coverImage: 'https://image.tmdb.org/t/p/w342/season.jpg' } });
  expect(result.entries[2]).toMatchObject({ season: 1, episode: 1, subtitle: 'Season 1 · Episode 1 · Pilot' });
  expect(result.complete).toBe(true);
});

test.each([0, 2])('an empty or partial list is distinguished from a complete list (count=%s)', async (count) => {
  const result = await Effect.runPromise(getSerializdList(deps({ ...list, numberOfItems: count, listItems: [] }), '42'));
  expect(result.complete).toBe(count === 0);
  expect(result.entries).toEqual([]);
});

test('malformed successful responses fail instead of becoming empty lists', async () => {
  const d = deps({ message: 'not list data' });
  const reads: Effect.Effect<unknown, ProviderError>[] = [getSerializdList(d, '42'), getSerializdListsPage(d, { username: 'gian', kind: 'created', page: 1 })];
  for (const read of reads) {
    expect((await Effect.runPromise(Effect.flip(read)))._tag).toBe('ProviderDecodeError');
  }
});

test('invalid addresses and paging never reach the transport', async () => {
  const d = deps({});
  d.fetch = async () => { throw new Error('unexpected request'); };
  const reads: Effect.Effect<unknown, ProviderError>[] = [
    getSerializdList(d, '42/likes/add'),
    getSerializdListsPage(d, { username: '../login', kind: 'created', page: 1 }),
    getSerializdListsPage(d, { username: 'gian', kind: 'created', page: 0 }),
  ];
  for (const read of reads) {
    expect((await Effect.runPromise(Effect.flip(read)))._tag).toBe('ProviderDecodeError');
  }
});
