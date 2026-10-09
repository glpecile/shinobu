import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, mock, test } from 'bun:test';
import { createElement, Suspense } from 'react';
// @ts-expect-error -- The installed react-dom package has no server-renderer declarations.
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
mock.module('@/lib/http/client', () => ({ httpFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
  authorization.push(new Headers(init?.headers).get('Authorization'));
  return Response.json(String(input).includes('/user/') ? { lists: [list], totalPages: 1 } : list);
} }));

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
