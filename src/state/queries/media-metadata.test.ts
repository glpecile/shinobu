import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

import type { NormalizedMediaItem } from '@/types/media';

GlobalRegistrator.register();
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { act, renderHook, waitFor } = await import('@testing-library/react');

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
let requests = 0;
mock.module('@/lib/http/client', () => ({ httpFetch: async () => { requests++; throw new Error('Cache-only metadata must not fetch'); } }));
mock.module('react-native', () => ({ Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web } }));
mock.module('expo-crypto', () => ({
  getRandomBytes: (count: number) => crypto.getRandomValues(new Uint8Array(count)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async () => 'unused',
}));

const { useMediaMetadata } = await import('./media-metadata');
const { letterboxdFilmQuery } = await import('./letterboxd');
const { mediaDetailsQueryKeys } = await import('./media-details');

function film(slug: string, title: string): NormalizedMediaItem {
  return { id: `letterboxd-${slug}`, title, type: 'MOVIE', coverImage: '', currentProgress: 0,
    progressUnit: 'episode', lastUpdated: '', externalIds: { letterboxd: slug } };
}

test('mounted metadata observes stale film/detail caches and later updates without starting reads', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const amnesia = Object.freeze(film('a-wind-named-amnesia', 'A Wind Named Amnesia'));
  const baby = Object.freeze(film('baby-love', 'Baby Love'));
  const items = Object.freeze([amnesia, baby]);
  const babyKey = mediaDetailsQueryKeys.details(baby);
  client.setQueryData(letterboxdFilmQuery('a-wind-named-amnesia', false).queryKey,
    { ...amnesia, runtime: 80, currentProgress: 999 }, { updatedAt: 1 });
  client.setQueryData(babyKey, { catalogue: { ...baby, runtime: 30 } }, { updatedAt: 1 });
  let fetches = 0;
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'fetch') fetches++;
  });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const read = renderHook(() => useMediaMetadata(items).items, { wrapper });
  try {
    expect(read.result.current.map(item => item.runtime)).toEqual([80, 30]);
    expect(read.result.current[0].currentProgress).toBe(0);
    expect(amnesia.runtime).toBeUndefined();
    await act(async () => { client.setQueryData(babyKey, { catalogue: { ...baby, runtime: 100 } }); });
    await waitFor(() => expect(read.result.current.map(item => item.runtime)).toEqual([80, 100]));
    expect(fetches).toBe(0);
    expect(requests).toBe(0);
  } finally {
    read.unmount();
    unsubscribe();
    client.clear();
  }
});
