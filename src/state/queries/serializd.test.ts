import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, mock, test } from 'bun:test';
import { createElement, Suspense } from 'react';
import { renderToString } from 'react-dom/server';

import type { NormalizedMediaItem } from '@/types/media';

const store = new Map<string, string>();
mock.module('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => store.set(key, value),
    remove: (key: string) => store.delete(key),
    getAllKeys: () => [...store.keys()],
    addOnValueChangedListener: () => ({ remove() {} }),
  }),
}));
const authorization: (string | null)[] = [];
const list = { listId: 42, listName: 'Pilots', owner: { username: 'gian' }, numberOfItems: 0, listItems: [] };
let writeResponse: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
mock.module('@/lib/http/client', () => ({ httpFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
  if (writeResponse != null) return writeResponse(input, init);
  authorization.push(new Headers(init?.headers).get('Authorization'));
  return Response.json(String(input).includes('/user/') ? { lists: [list], totalPages: 1 } : list);
} }));
mock.module('react-native', () => ({ Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web } }));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { findInSerializdListsCache, serializdQueryKeys, useSuspenseSerializdListQuery, useSuspenseSerializdListsQuery } = await import('./serializd');
const { setProviderSession, clearProviderSession } = await import('@/state/session/tokens');

function Detail({ username }: { username: string | null }) {
  useSuspenseSerializdListQuery(username, '42');
  return null;
}

function Index({ username }: { username: string | null }) {
  useSuspenseSerializdListsQuery(username ?? '', 'created');
  return null;
}

test.each([
  ['detail', null, null],
  ['detail', 'other', null],
  ['index', 'other', null],
  ['detail', 'gian', 'Bearer tok'],
  ['index', 'gian', 'Bearer tok'],
] as const)('%s query for %s authenticates only its keyed account', async (kind, username, expected) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setProviderSession('serializd', { accessToken: 'tok', username: 'gian' });
  authorization.length = 0;
  try {
    renderToString(createElement(QueryClientProvider, { client },
      createElement(Suspense, { fallback: null }, createElement(kind === 'detail' ? Detail : Index, { username })),
    ));
    await Promise.all(client.getQueryCache().getAll().map((query) => query.promise));
    expect(authorization).toEqual([expected]);
    expect(client.getQueryCache().getAll()[0].state.status).toBe('success');
  } finally {
    client.clear();
    clearProviderSession('serializd');
  }
});

test('details resolve cached list media only from the current Serializd account', () => {
  const client = new QueryClient();
  const item: NormalizedMediaItem = {
    id: 'tmdb-tv-1396', title: 'Breaking Bad', coverImage: '', type: 'TV',
    currentProgress: 0, progressUnit: 'episode', lastUpdated: '2026-10-08T00:00:00Z', externalIds: { tmdb: 1396 },
  };
  client.setQueryData(serializdQueryKeys.list('gian', '42'), { entries: [{ id: '1396//', item }] });
  setProviderSession('serializd', { accessToken: 'tok', username: 'gian' });
  expect(findInSerializdListsCache(client, item.id)).toEqual(item);
  setProviderSession('serializd', { accessToken: 'other', username: 'other' });
  expect(findInSerializdListsCache(client, item.id)).toBeUndefined();
  clearProviderSession('serializd');
  expect(findInSerializdListsCache(client, item.id)).toBeUndefined();
  client.setQueryData(serializdQueryKeys.list(null, '7'), { entries: [{ id: '1396//', item }] });
  expect(findInSerializdListsCache(client, item.id)).toEqual(item);
});

test('a membership edit waits for a pending rename and preserves both changes', async () => {
  const { useListMembership, useRenameList } = await import('./list-membership');
  const client = new QueryClient();
  const target = { provider: 'serializd', username: 'gian', id: '42', title: 'Pilots', url: 'https://www.serializd.com/list/42' } as const;
  const show = { showId: 1396, showName: 'Breaking Bad' };
  let current = { ...list, listItems: [show], numberOfItems: 1, listDescription: '', listCollaborators: [], isPrivate: false, isRanked: false, allowsComments: false, bannerImagePath: null };
  const saving = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const pending: Promise<unknown>[] = [];
  let membership!: ReturnType<typeof useListMembership>;
  let rename!: ReturnType<typeof useRenameList>;
  function Read() {
    membership = useListMembership(target);
    rename = useRenameList(target);
    return null;
  }
  writeResponse = async (input, init) => {
    if (init?.method !== 'POST') return Response.json(current);
    const body = JSON.parse(String(init.body));
    if (String(input).endsWith('/list/edit')) {
      saving.resolve();
      await release.promise;
      current = { ...current, listName: body.list_name, listItems: body.list_items, numberOfItems: body.list_items.length };
    } else {
      current = { ...current, listItems: [...current.listItems, { showId: body.show_id, showName: 'The Wire' }], numberOfItems: current.numberOfItems + 1 };
    }
    return Response.json({});
  };
  setProviderSession('serializd', { accessToken: 'tok', username: 'gian' });
  try {
    renderToString(createElement(QueryClientProvider, { client }, createElement(Read)));
    const renamed = rename.mutateAsync('Favourites');
    pending.push(renamed);
    await saving.promise;
    const added = membership.mutateAsync({ present: true, item: { id: 'tmdb-tv-1438', title: 'The Wire', type: 'TV', coverImage: '', currentProgress: 0, progressUnit: 'episode', lastUpdated: '', externalIds: { tmdb: 1438 } } });
    pending.push(added);
    expect(client.getMutationCache().getAll().find((mutation) => mutation.state.variables !== 'Favourites')?.state.isPaused).toBe(true);
    release.resolve();
    await Promise.all([renamed, added]);
    expect(current.listName).toBe('Favourites');
    expect(current.listItems.map((entry) => entry.showId)).toEqual([1396, 1438]);
  } finally {
    release.resolve();
    await Promise.allSettled(pending);
    writeResponse = undefined;
    client.clear();
    clearProviderSession('serializd');
  }
});
