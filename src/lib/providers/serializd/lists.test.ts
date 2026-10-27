import { expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';
import type { ProviderError } from '@/lib/providers/errors';

import type { SerializdDeps } from './deps';
import { createSerializdList, getSerializdList, renameSerializdList, getSerializdListsPage, setSerializdListMembership } from './lists';

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

test('a season entry without seasonId never collapses onto the show entry', async () => {
  const bareSeason = { ...show, season: { seasonNumber: 1, name: 'Season 1' } };
  const result = await Effect.runPromise(getSerializdList(deps({ ...list, numberOfItems: 3, listItems: [show, bareSeason] }), '42'));
  expect(result.entries.map((entry) => entry.id)).toEqual(['1396//', '1396/1/']);
  expect(result.entries[1]).toMatchObject({ season: 1 });
});

test('episode 0 entries decode instead of failing the whole list', async () => {
  const special = { ...show, season: { seasonNumber: 0, name: 'Specials' }, episode: { episode_number: 0, name: 'OVA' } };
  const result = await Effect.runPromise(getSerializdList(deps({ ...list, numberOfItems: 1, listItems: [special] }), '42'));
  expect(result.entries).toEqual([expect.objectContaining({ id: '1396/0/0', season: 0, episode: 0 })]);
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
    getSerializdListsPage(d, { username: 'john..doe', kind: 'created', page: 1 }),
    getSerializdListsPage(d, { username: 'gian', kind: 'created', page: 0 }),
  ];
  for (const read of reads) {
    expect((await Effect.runPromise(Effect.flip(read)))._tag).toBe('ProviderDecodeError');
  }
});

test('membership removal preserves editor settings and the other entries of the same show', async () => {
  const season = { ...show, seasonId: 3572, season: { name: 'Season 1', seasonNumber: 1 }, description: 'Keep this note' };
  const episode = { ...season, episode: { episode_number: 1, name: 'Pilot' } };
  const original = { ...list, numberOfItems: 3, listItems: [show, season, episode], listDescription: 'My favourites', listCollaborators: [{ username: 'friend' }], isPrivate: true, isRanked: false, allowsComments: true, bannerImagePath: '/banner.jpg' };
  let current = original;
  const d = deps(current);
  d.fetch = async (url, init) => {
    if (init?.method === 'POST') {
      expect(String(url)).toBe('https://api.test/list/edit');
      expect(JSON.parse(String(init.body))).toEqual({ list_id: 42, list_name: 'Pilots', list_description: 'My favourites', list_items: [show, season], list_collaborators: [{ username: 'friend' }], is_private: true, is_ranked: false, allows_comments: true, banner_image_path: '/banner.jpg' });
      current = { ...original, numberOfItems: 2, listItems: [show, season] };
      return Response.json({});
    }
    return Response.json(current);
  };
  const item = (await Effect.runPromise(getSerializdList(d, '42'))).entries[0].item;
  const result = await Effect.runPromise(setSerializdListMembership(d, { id: '42', username: 'gian', item, entryId: '1396/3572/1', present: false }));
  expect(result.entries.map((entry) => entry.id)).toEqual(['1396//', '1396/3572/']);
});

test('membership refuses other owners and uncertain membership before submitting', async () => {
  for (const [payload, present] of [[{ ...list, owner: { username: 'someone-else' } }, false], [list, false], [list, true]] as const) {
    const d = deps(payload);
    let writes = 0;
    d.fetch = async (_url, init) => { if (init?.method === 'POST') writes += 1; return Response.json(payload); };
    const item = (await Effect.runPromise(getSerializdList(d, '42'))).entries[0].item;
    expect((await Effect.runPromise(Effect.flip(setSerializdListMembership(d, { id: '42', username: 'gian', item: present ? { ...item, externalIds: { tmdb: 1438 } } : item, present }))))._tag).toBe('ProviderDecodeError');
    expect(writes).toBe(0);
  }
});

test('membership adds once and requires read-back evidence rather than trusting a successful POST', async () => {
  for (const persisted of [true, false]) {
    let current = { ...list, numberOfItems: 0, listItems: [] as typeof list.listItems };
    let writes = 0;
    const d = deps(current);
    d.fetch = async (url, init) => {
      if (init?.method === 'POST') {
        writes += 1;
        expect(String(url)).toBe('https://api.test/list/add_item');
        expect(JSON.parse(String(init.body))).toEqual({ list_id: 42, show_id: 1396 });
        if (persisted) current = { ...list, numberOfItems: 1 };
        return Response.json({});
      }
      return Response.json(current);
    };
    const item = (await Effect.runPromise(getSerializdList(deps(list), '42'))).entries[0].item;
    const write = () => setSerializdListMembership(d, { id: '42', username: 'gian', item, present: true });
    if (persisted) {
      expect((await Effect.runPromise(write())).entries).toHaveLength(1);
      await Effect.runPromise(write());
    } else expect((await Effect.runPromise(Effect.flip(write())))._tag).toBe('ProviderDecodeError');
    expect(writes).toBe(1);
  }
});

test('creation posts the editor payload, then confirms the new list belongs to the account', async () => {
  const item = (await Effect.runPromise(getSerializdList(deps(list), '42'))).entries[0].item;
  const draft = { username: 'gian', name: ' Pilots ', description: 'Firsts', isPrivate: true, isRanked: false, allowsComments: true, items: [item] };
  for (const owner of ['gian', 'someone-else']) {
    const d = deps(list);
    d.fetch = async (url, init) => {
      if (init?.method !== 'POST') return Response.json({ ...list, owner: { username: owner }, numberOfItems: 1 });
      expect(String(url)).toBe('https://api.test/list/create');
      expect(JSON.parse(String(init.body))).toEqual({ list_name: 'Pilots', list_description: 'Firsts', list_items: [{ show_id: 1396, season_id: null, position: 0, description: '' }], list_collaborators: [], is_private: true, is_ranked: false, allows_comments: true, banner_image_path: '' });
      return Response.json({ listId: 42 });
    };
    if (owner === 'gian') expect((await Effect.runPromise(createSerializdList(d, draft))).id).toBe('42');
    else expect((await Effect.runPromise(Effect.flip(createSerializdList(d, draft))))._tag).toBe('ProviderDecodeError');
  }
  const d = deps({});
  d.fetch = async () => { throw new Error('unexpected request'); };
  for (const invalid of [{ ...draft, items: [] }, { ...draft, name: ' ' }, { ...draft, items: [{ ...item, type: 'MOVIE' as const }] }]) {
    expect((await Effect.runPromise(Effect.flip(createSerializdList(d, invalid))))._tag).toBe('ProviderDecodeError');
  }
});

test('rename keeps every editor setting and entry, and refuses a partial list', async () => {
  const season = { ...show, seasonId: 3572, season: { name: 'Season 1', seasonNumber: 1 }, description: 'Keep this note' };
  const editor = { listDescription: 'My favourites', listCollaborators: [], isPrivate: true, isRanked: false, allowsComments: true, bannerImagePath: null };
  for (const complete of [true, false]) {
    let current = { ...list, ...editor, numberOfItems: complete ? 2 : 3, listItems: [show, season] };
    let writes = 0;
    const d = deps(current);
    d.fetch = async (url, init) => {
      if (init?.method !== 'POST') return Response.json(current);
      writes += 1;
      expect(String(url)).toBe('https://api.test/list/edit');
      expect(JSON.parse(String(init.body))).toEqual({ list_id: 42, list_name: 'Pilots, ranked', list_description: 'My favourites', list_items: [show, season], list_collaborators: [], is_private: true, is_ranked: false, allows_comments: true, banner_image_path: null });
      current = { ...current, listName: 'Pilots, ranked' };
      return Response.json({});
    };
    const rename = renameSerializdList(d, { id: '42', username: 'gian', name: ' Pilots, ranked ' });
    if (complete) expect((await Effect.runPromise(rename)).title).toBe('Pilots, ranked');
    else expect((await Effect.runPromise(Effect.flip(rename)))._tag).toBe('ProviderDecodeError');
    expect(writes).toBe(complete ? 1 : 0);
  }
});
