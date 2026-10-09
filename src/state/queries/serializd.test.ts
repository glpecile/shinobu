import { QueryClient } from '@tanstack/react-query';
import { expect, mock, test } from 'bun:test';

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
mock.module('@/lib/http/client', () => ({ httpFetch: async () => Response.json({}) }));

const { findInSerializdListsCache, serializdQueryKeys } = await import('./serializd');
const { setProviderSession, clearProviderSession } = await import('@/state/session/tokens');

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
